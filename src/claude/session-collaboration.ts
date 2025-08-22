import { EventEmitter } from 'events';
import { EmbedBuilder, User } from 'discord.js';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface CollaborationSession {
  id: string;
  hostUserId: string;
  participantIds: string[];
  observerIds: string[];
  sessionId: string; // Claude session ID
  channelId: string;
  createdAt: number;
  lastActivity: number;
  mode: 'collaborative' | 'handoff' | 'observation';
  permissions: Map<string, CollaborationPermission>;
  history: CollaborationEvent[];
  recording: boolean;
  recordedActions: any[];
}

export interface CollaborationPermission {
  canWrite: boolean;
  canExecute: boolean;
  canManage: boolean;
  canInvite: boolean;
}

export interface CollaborationEvent {
  id: string;
  userId: string;
  action: string;
  data?: any;
  timestamp: number;
}

export interface CollaborationInvite {
  id: string;
  sessionId: string;
  inviterId: string;
  inviteeId: string;
  permissions: CollaborationPermission;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
}

export class SessionCollaborationManager extends EventEmitter {
  private static instance: SessionCollaborationManager;
  private collaborations: Map<string, CollaborationSession> = new Map();
  private invites: Map<string, CollaborationInvite> = new Map();
  private userSessions: Map<string, Set<string>> = new Map(); // userId -> sessionIds
  private recordings: Map<string, any[]> = new Map();

  private constructor() {
    super();
    this.startCleanupInterval();
  }

  static getInstance(): SessionCollaborationManager {
    if (!SessionCollaborationManager.instance) {
      SessionCollaborationManager.instance = new SessionCollaborationManager();
    }
    return SessionCollaborationManager.instance;
  }

  /**
   * Create a new collaboration session
   */
  createCollaboration(
    hostUserId: string,
    sessionId: string,
    channelId: string,
    mode: 'collaborative' | 'handoff' | 'observation' = 'collaborative'
  ): CollaborationSession {
    const collaborationId = uuidv4();
    
    const collaboration: CollaborationSession = {
      id: collaborationId,
      hostUserId,
      participantIds: [],
      observerIds: [],
      sessionId,
      channelId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      mode,
      permissions: new Map(),
      history: [],
      recording: false,
      recordedActions: []
    };

    // Set host permissions
    collaboration.permissions.set(hostUserId, {
      canWrite: true,
      canExecute: true,
      canManage: true,
      canInvite: true
    });

    this.collaborations.set(collaborationId, collaboration);
    this.addUserSession(hostUserId, collaborationId);

    logger.info(`Created collaboration session ${collaborationId} for session ${sessionId}`);
    this.emit('collaborationCreated', collaboration);

    return collaboration;
  }

  /**
   * Invite a user to collaborate
   */
  inviteUser(
    collaborationId: string,
    inviterId: string,
    inviteeId: string,
    permissions: Partial<CollaborationPermission> = {}
  ): CollaborationInvite | null {
    const collaboration = this.collaborations.get(collaborationId);
    if (!collaboration) {
      logger.error(`Collaboration ${collaborationId} not found`);
      return null;
    }

    // Check if inviter has permission to invite
    const inviterPerms = collaboration.permissions.get(inviterId);
    if (!inviterPerms?.canInvite) {
      logger.error(`User ${inviterId} cannot invite to collaboration ${collaborationId}`);
      return null;
    }

    const inviteId = uuidv4();
    const invite: CollaborationInvite = {
      id: inviteId,
      sessionId: collaborationId,
      inviterId,
      inviteeId,
      permissions: {
        canWrite: permissions.canWrite ?? true,
        canExecute: permissions.canExecute ?? false,
        canManage: permissions.canManage ?? false,
        canInvite: permissions.canInvite ?? false
      },
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
      status: 'pending'
    };

    this.invites.set(inviteId, invite);
    
    logger.info(`Created invite ${inviteId} for user ${inviteeId} to collaboration ${collaborationId}`);
    this.emit('inviteCreated', invite);

    return invite;
  }

  /**
   * Accept an invitation
   */
  acceptInvite(inviteId: string): boolean {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.status !== 'pending') {
      return false;
    }

    if (Date.now() > invite.expiresAt) {
      invite.status = 'expired';
      return false;
    }

    const collaboration = this.collaborations.get(invite.sessionId);
    if (!collaboration) {
      return false;
    }

    // Add user to collaboration
    if (invite.permissions.canWrite) {
      collaboration.participantIds.push(invite.inviteeId);
    } else {
      collaboration.observerIds.push(invite.inviteeId);
    }

    // Set permissions
    collaboration.permissions.set(invite.inviteeId, invite.permissions);
    
    // Update invite status
    invite.status = 'accepted';
    
    // Track user session
    this.addUserSession(invite.inviteeId, collaboration.id);

    // Log event
    this.logEvent(collaboration.id, invite.inviteeId, 'joined', {
      role: invite.permissions.canWrite ? 'participant' : 'observer'
    });

    logger.info(`User ${invite.inviteeId} accepted invite to collaboration ${collaboration.id}`);
    this.emit('userJoined', { collaboration, userId: invite.inviteeId });

    return true;
  }

  /**
   * Decline an invitation
   */
  declineInvite(inviteId: string): boolean {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.status !== 'pending') {
      return false;
    }

    invite.status = 'declined';
    logger.info(`Invite ${inviteId} declined`);
    
    return true;
  }

  /**
   * Leave a collaboration
   */
  leaveCollaboration(collaborationId: string, userId: string): boolean {
    const collaboration = this.collaborations.get(collaborationId);
    if (!collaboration) {
      return false;
    }

    // Remove from participants/observers
    collaboration.participantIds = collaboration.participantIds.filter(id => id !== userId);
    collaboration.observerIds = collaboration.observerIds.filter(id => id !== userId);
    
    // Remove permissions
    collaboration.permissions.delete(userId);
    
    // Remove from user sessions
    this.removeUserSession(userId, collaborationId);

    // Log event
    this.logEvent(collaborationId, userId, 'left');

    logger.info(`User ${userId} left collaboration ${collaborationId}`);
    this.emit('userLeft', { collaboration, userId });

    // If host left, transfer ownership or end collaboration
    if (userId === collaboration.hostUserId) {
      if (collaboration.participantIds.length > 0) {
        collaboration.hostUserId = collaboration.participantIds[0];
        this.logEvent(collaborationId, collaboration.hostUserId, 'became_host');
      } else {
        this.endCollaboration(collaborationId);
      }
    }

    return true;
  }

  /**
   * Handoff session to another user
   */
  handoffSession(
    collaborationId: string,
    fromUserId: string,
    toUserId: string
  ): boolean {
    const collaboration = this.collaborations.get(collaborationId);
    if (!collaboration) {
      return false;
    }

    // Check permissions
    const fromPerms = collaboration.permissions.get(fromUserId);
    if (!fromPerms?.canManage && fromUserId !== collaboration.hostUserId) {
      logger.error(`User ${fromUserId} cannot handoff session`);
      return false;
    }

    // Update host
    collaboration.hostUserId = toUserId;
    collaboration.mode = 'handoff';
    
    // Ensure new host has full permissions
    collaboration.permissions.set(toUserId, {
      canWrite: true,
      canExecute: true,
      canManage: true,
      canInvite: true
    });

    // Add to participants if not already
    if (!collaboration.participantIds.includes(toUserId)) {
      collaboration.participantIds.push(toUserId);
      collaboration.observerIds = collaboration.observerIds.filter(id => id !== toUserId);
    }

    // Log event
    this.logEvent(collaborationId, fromUserId, 'handoff', { to: toUserId });

    logger.info(`Session ${collaborationId} handed off from ${fromUserId} to ${toUserId}`);
    this.emit('sessionHandoff', { collaboration, from: fromUserId, to: toUserId });

    return true;
  }

  /**
   * Start recording a session
   */
  startRecording(collaborationId: string, userId: string): boolean {
    const collaboration = this.collaborations.get(collaborationId);
    if (!collaboration) {
      return false;
    }

    const perms = collaboration.permissions.get(userId);
    if (!perms?.canManage) {
      logger.error(`User ${userId} cannot start recording`);
      return false;
    }

    collaboration.recording = true;
    collaboration.recordedActions = [];
    
    this.logEvent(collaborationId, userId, 'recording_started');
    logger.info(`Started recording collaboration ${collaborationId}`);
    
    return true;
  }

  /**
   * Stop recording a session
   */
  stopRecording(collaborationId: string, userId: string): any[] | null {
    const collaboration = this.collaborations.get(collaborationId);
    if (!collaboration || !collaboration.recording) {
      return null;
    }

    const perms = collaboration.permissions.get(userId);
    if (!perms?.canManage) {
      logger.error(`User ${userId} cannot stop recording`);
      return null;
    }

    collaboration.recording = false;
    const recording = [...collaboration.recordedActions];
    
    this.recordings.set(collaborationId, recording);
    this.logEvent(collaborationId, userId, 'recording_stopped', {
      actionCount: recording.length
    });
    
    logger.info(`Stopped recording collaboration ${collaborationId} with ${recording.length} actions`);
    
    return recording;
  }

  /**
   * Record an action
   */
  recordAction(collaborationId: string, action: any): void {
    const collaboration = this.collaborations.get(collaborationId);
    if (!collaboration || !collaboration.recording) {
      return;
    }

    collaboration.recordedActions.push({
      ...action,
      timestamp: Date.now()
    });
  }

  /**
   * Playback a recorded session
   */
  async playbackRecording(
    recordingId: string,
    targetSessionId: string,
    speed: number = 1
  ): Promise<void> {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording ${recordingId} not found`);
    }

    logger.info(`Starting playback of ${recording.length} actions to session ${targetSessionId}`);

    for (const action of recording) {
      // Emit action for replay
      this.emit('playbackAction', {
        sessionId: targetSessionId,
        action
      });

      // Wait based on timestamp differences and speed
      if (action.timestamp) {
        const delay = action.delay || 100;
        await new Promise(resolve => setTimeout(resolve, delay / speed));
      }
    }

    logger.info(`Completed playback to session ${targetSessionId}`);
  }

  /**
   * Update user permissions
   */
  updatePermissions(
    collaborationId: string,
    userId: string,
    permissions: Partial<CollaborationPermission>
  ): boolean {
    const collaboration = this.collaborations.get(collaborationId);
    if (!collaboration) {
      return false;
    }

    const currentPerms = collaboration.permissions.get(userId);
    if (!currentPerms) {
      return false;
    }

    collaboration.permissions.set(userId, {
      ...currentPerms,
      ...permissions
    });

    // Move between participants and observers if needed
    if (permissions.canWrite !== undefined) {
      if (permissions.canWrite) {
        // Move to participants
        if (!collaboration.participantIds.includes(userId)) {
          collaboration.participantIds.push(userId);
          collaboration.observerIds = collaboration.observerIds.filter(id => id !== userId);
        }
      } else {
        // Move to observers
        if (!collaboration.observerIds.includes(userId)) {
          collaboration.observerIds.push(userId);
          collaboration.participantIds = collaboration.participantIds.filter(id => id !== userId);
        }
      }
    }

    this.logEvent(collaborationId, userId, 'permissions_updated', permissions);
    
    return true;
  }

  /**
   * Get collaboration by session ID
   */
  getCollaborationBySession(sessionId: string): CollaborationSession | undefined {
    for (const collaboration of this.collaborations.values()) {
      if (collaboration.sessionId === sessionId) {
        return collaboration;
      }
    }
    return undefined;
  }

  /**
   * Get user's collaborations
   */
  getUserCollaborations(userId: string): CollaborationSession[] {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) {
      return [];
    }

    return Array.from(sessionIds)
      .map(id => this.collaborations.get(id))
      .filter(c => c !== undefined) as CollaborationSession[];
  }

  /**
   * Check if user can perform action
   */
  canUserPerformAction(
    collaborationId: string,
    userId: string,
    action: 'write' | 'execute' | 'manage' | 'invite'
  ): boolean {
    const collaboration = this.collaborations.get(collaborationId);
    if (!collaboration) {
      return false;
    }

    const perms = collaboration.permissions.get(userId);
    if (!perms) {
      return false;
    }

    switch (action) {
      case 'write':
        return perms.canWrite;
      case 'execute':
        return perms.canExecute;
      case 'manage':
        return perms.canManage;
      case 'invite':
        return perms.canInvite;
      default:
        return false;
    }
  }

  /**
   * Create collaboration status embed
   */
  createStatusEmbed(collaboration: CollaborationSession): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('🤝 Collaboration Session')
      .setColor(0x00ff00)
      .addFields(
        {
          name: '📋 Session ID',
          value: collaboration.id.substring(0, 8),
          inline: true
        },
        {
          name: '👤 Host',
          value: `<@${collaboration.hostUserId}>`,
          inline: true
        },
        {
          name: '📊 Mode',
          value: collaboration.mode,
          inline: true
        },
        {
          name: '👥 Participants',
          value: collaboration.participantIds.length > 0 
            ? collaboration.participantIds.map(id => `<@${id}>`).join(', ')
            : 'None',
          inline: false
        },
        {
          name: '👁️ Observers',
          value: collaboration.observerIds.length > 0
            ? collaboration.observerIds.map(id => `<@${id}>`).join(', ')
            : 'None',
          inline: false
        },
        {
          name: '📼 Recording',
          value: collaboration.recording ? '🔴 Recording' : '⚫ Not Recording',
          inline: true
        },
        {
          name: '📝 Events',
          value: `${collaboration.history.length} events logged`,
          inline: true
        }
      )
      .setTimestamp();

    return embed;
  }

  /**
   * End a collaboration
   */
  private endCollaboration(collaborationId: string): void {
    const collaboration = this.collaborations.get(collaborationId);
    if (!collaboration) {
      return;
    }

    // Remove all user sessions
    const allUsers = [
      collaboration.hostUserId,
      ...collaboration.participantIds,
      ...collaboration.observerIds
    ];
    
    allUsers.forEach(userId => {
      this.removeUserSession(userId, collaborationId);
    });

    // Save recording if active
    if (collaboration.recording) {
      this.recordings.set(collaborationId, collaboration.recordedActions);
    }

    this.collaborations.delete(collaborationId);
    
    logger.info(`Ended collaboration ${collaborationId}`);
    this.emit('collaborationEnded', collaboration);
  }

  /**
   * Log an event
   */
  private logEvent(
    collaborationId: string,
    userId: string,
    action: string,
    data?: any
  ): void {
    const collaboration = this.collaborations.get(collaborationId);
    if (!collaboration) {
      return;
    }

    const event: CollaborationEvent = {
      id: uuidv4(),
      userId,
      action,
      data,
      timestamp: Date.now()
    };

    collaboration.history.push(event);
    collaboration.lastActivity = Date.now();

    // Record if recording
    if (collaboration.recording) {
      this.recordAction(collaborationId, event);
    }

    this.emit('collaborationEvent', { collaborationId, event });
  }

  /**
   * Add user session mapping
   */
  private addUserSession(userId: string, sessionId: string): void {
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(sessionId);
  }

  /**
   * Remove user session mapping
   */
  private removeUserSession(userId: string, sessionId: string): void {
    const sessions = this.userSessions.get(userId);
    if (sessions) {
      sessions.delete(sessionId);
      if (sessions.size === 0) {
        this.userSessions.delete(userId);
      }
    }
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      // Clean up old collaborations
      for (const [id, collaboration] of this.collaborations.entries()) {
        if (now - collaboration.lastActivity > maxAge) {
          this.endCollaboration(id);
        }
      }

      // Clean up expired invites
      for (const [id, invite] of this.invites.entries()) {
        if (now > invite.expiresAt && invite.status === 'pending') {
          invite.status = 'expired';
        }
        if (invite.status === 'expired' || invite.status === 'declined') {
          this.invites.delete(id);
        }
      }
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    activeCollaborations: number;
    totalParticipants: number;
    totalObservers: number;
    activeRecordings: number;
    storedRecordings: number;
    pendingInvites: number;
  } {
    let totalParticipants = 0;
    let totalObservers = 0;
    let activeRecordings = 0;

    for (const collaboration of this.collaborations.values()) {
      totalParticipants += collaboration.participantIds.length;
      totalObservers += collaboration.observerIds.length;
      if (collaboration.recording) {
        activeRecordings++;
      }
    }

    const pendingInvites = Array.from(this.invites.values())
      .filter(i => i.status === 'pending').length;

    return {
      activeCollaborations: this.collaborations.size,
      totalParticipants,
      totalObservers,
      activeRecordings,
      storedRecordings: this.recordings.size,
      pendingInvites
    };
  }
}