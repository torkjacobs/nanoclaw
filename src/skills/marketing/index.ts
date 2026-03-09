/**
 * Skill 8: Marketing Engine — Barrel Export & Command Router
 *
 * Exports all three modules and provides unified command
 * detection + routing for WhatsApp commands.
 *
 * Commands routed:
 *   @tork !content generate <type> <topic_index>
 *   @tork !content list
 *   @tork !content approve <id>
 *   @tork !content reject <id> <reason>
 *   @tork !publish devto|twitter|linkedin|hashnode <content_id>
 *   @tork !publish all <content_id>
 *   @tork !comment <url> <message>
 *   @tork !guestpost <target>
 *   @tork !answer <platform> <question_summary>
 */

// Module A: Directory Submission Templates
export {
  type DirectoryTemplate,
  type DirectoryCategory,
  type DirectoryPriority,
  type DirectoryStatus,
  DIRECTORY_TEMPLATES,
  getDirectories,
  getDirectoriesByPriority,
  getDirectoriesByStatus,
  markDirectorySubmitted,
  markDirectoryLive,
  formatDirectoryDashboard,
  getSubmissionCopy,
} from './module-a-directories.js';

// Module B: Content Generation + Approval Queue
export {
  type ContentType,
  type ContentStatus,
  type ContentRow,
  TOPIC_TEMPLATES,
  generateContent,
  listContent,
  getContentById,
  approveContent,
  rejectContent,
  markPublished,
  rewriteForPublish,
  isContentQueueRequest,
  handleContentQueueCommand,
} from './module-b-content.js';

// Module C: Auto-Publish Connectors
export {
  isPublishRequest,
  handlePublishCommand,
} from './module-c-publish.js';

// ══════════════════════════════════════════════════════════════
//  UNIFIED COMMAND DETECTION & ROUTING
// ══════════════════════════════════════════════════════════════

import { isContentQueueRequest, handleContentQueueCommand } from './module-b-content.js';
import { isPublishRequest, handlePublishCommand } from './module-c-publish.js';

/**
 * Detect if a message is a Marketing Engine command.
 * Checks all three modules' command patterns.
 */
export function isMarketingEngineRequest(content: string): boolean {
  return isContentQueueRequest(content) || isPublishRequest(content);
}

/**
 * Route a Marketing Engine command to the appropriate handler.
 * Returns the response string for WhatsApp.
 */
export async function handleMarketingEngineCommand(
  content: string,
): Promise<string> {
  if (isContentQueueRequest(content)) {
    return handleContentQueueCommand(content);
  }
  if (isPublishRequest(content)) {
    return handlePublishCommand(content);
  }
  return 'Unknown marketing engine command.';
}
