
import {
  Check,
  CheckCheck,
  Reply,
  X,
  Check as SaveIcon,
  FileText,
  ZoomIn,
} from "lucide-react";

import MentionText from "../MentionText";

import MessageActions from "./MessageActions";
import MessageDeleteConfirm from "./MessageDeleteConfirm";

import {
  sameId,
  getMessageId,
  getAttachmentUrl,
  getReplyPreview,
} from "../../utils/messageHelpers";

export default function MessageBubble({
  message,
  mine,
  user,
  loggedInUserId,
  messageTime,
  replyTarget,
  editing,
  editDraft,
  savingEdit,
  setEditDraft,
  saveEditedMessage,
  cancelEditing,
  startEditing,
  onReply,
  removeImage,
  onOpenImage,
  jumpToMessage,
  menuOpen,
  onToggleMenu,
  confirmDelete,
  deleteType,
  onDeleteForYou,
  onDeleteForEveryone,
  onConfirmDelete,
  onCancelDelete,
}) {
  const deleted = message.isDeleted === true;
  const attachment = message.attachment;
  const attachmentUrl = getAttachmentUrl(attachment);
  const isImage = attachment?.mimeType?.startsWith("image/");

  function getSenderDisplayName() {
    const sender = message?.sender;

    const senderName =
      message?.senderName ||
      (typeof sender === "object" && sender !== null
        ? sender.username || sender.name
        : null);

    if (senderName) return senderName;

    if (mine) {
      return user?.username || user?.name || "You";
    }

    return "User";
  }

  return (
    <div className="message-content">
      {(!mine || message.isGroup) && (
        <div className="message-heading">
          <span className="sender-name">
            {getSenderDisplayName()}
          </span>

          {!mine && (
            <span className="message-time">
              {messageTime}
            </span>
          )}
        </div>
      )}

      <div className="message-bubble-wrap">
        <div
          className={`message-bubble ${
            mine ? "bubble-mine" : "bubble-theirs"
          } ${editing ? "bubble-editing" : ""} ${
            deleted ? "bubble-deleted" : ""
          }`}
        >
          {deleted ? (
            <div className="deleted-message">
              {sameId(message.deletedBy, loggedInUserId)
                ? "You deleted this message"
                : "This message was deleted"}
            </div>
          ) : (
            <>
              {replyTarget && (
                <button
                  type="button"
                  className="reply-quote"
                  onClick={() =>
                    jumpToMessage(getMessageId(replyTarget))
                  }
                  title="Go to original message"
                >
                  <div className="reply-quote-heading">
                    <Reply size={14} />

                    <span>
                      {replyTarget.senderName ||
                        (typeof replyTarget.sender === "object"
                          ? replyTarget.sender?.username ||
                            replyTarget.sender?.name
                          : "User")}
                    </span>
                  </div>

                  <p className="reply-quote-text">
                    {getReplyPreview(replyTarget)}
                  </p>
                </button>
              )}

              {editing ? (
                <>
                  {attachment && isImage && (
                    <div className="message-attachment">
                      <img
                        src={attachmentUrl}
                        alt={attachment.originalName || "Attachment"}
                        className="message-image"
                      />
                    </div>
                  )}

                  <div className="message-edit-form">
                    <textarea
                      className="message-edit-input"
                      value={editDraft}
                      onChange={(event) =>
                        setEditDraft(
                          event.target.value.slice(0, 4000)
                        )
                      }
                      maxLength={4000}
                      rows={Math.min(
                        6,
                        Math.max(
                          2,
                          (editDraft || "").split("\n").length
                        )
                      )}
                      autoFocus
                      aria-label="Edit message"
                    />

                    <div className="message-edit-footer">
                      <span className="edit-character-count">
                        {(editDraft || "").length}/4000
                      </span>

                      <div className="message-edit-actions">
                        <button
                          type="button"
                          className="message-action-button cancel-edit-button"
                          onClick={cancelEditing}
                          disabled={savingEdit}
                        >
                          <X size={15} />
                          Cancel
                        </button>

                        <button
                          type="button"
                          className="message-action-button save-edit-button"
                          onClick={() =>
                            saveEditedMessage(message)
                          }
                          disabled={
                            savingEdit || (!editDraft.trim() &&  !attachment)
                          }
                        >
                          <SaveIcon size={15} />

                          {savingEdit ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {attachment && (
                    <div className="message-attachment">
                      {isImage ? (
                        <button
                          type="button"
                          className="message-image-button"
                          onClick={() =>
                            onOpenImage(attachment, message)
                          }
                          aria-label="View image larger"
                        >
                          <img
                            src={attachmentUrl}
                            alt={
                              attachment.originalName ||
                              "Attachment"
                            }
                            className="message-image"
                            loading="lazy"
                          />

                          <span className="image-zoom-hint">
                            <ZoomIn size={16} />
                            View image
                          </span>
                        </button>
                      ) : (
                        <a
                          href={attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="message-file-link"
                        >
                          <span className="message-file-icon">
                            <FileText size={20} />
                          </span>

                          <span className="message-file-details">
                            <strong>
                              {attachment.originalName ||
                                "Download file"}
                            </strong>

                            <small>Open attachment</small>
                          </span>
                        </a>
                      )}

                      {mine && isImage && removeImage && (
                        <button
                          type="button"
                          className="remove-message-image"
                          onClick={() =>
                            removeImage(getMessageId(message))
                          }
                          aria-label="Remove image attachment"
                          title="Remove image"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  )}

                  {message.text?.trim() && (
                    <div className="message-text">
                      <MentionText text={message.text} />
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {!editing && !deleted && (
          <MessageActions
            mine={mine}
            menuOpen={menuOpen}
            onReply={onReply}
            onEdit={() => startEditing(message)}
            onToggleMenu={onToggleMenu}
            onDeleteForYou={onDeleteForYou}
            onDeleteForEveryone={onDeleteForEveryone}
          />
        )}
      </div>

      {confirmDelete && !deleted && (
        <MessageDeleteConfirm
          mine={mine}
          deleteType={deleteType}
          onConfirm={() => onConfirmDelete(message)}
          onCancel={onCancelDelete}
        />
      )}

      {mine && !deleted && (
        <div className="message-meta">
          {message.updatedAt &&
            message.createdAt &&
            new Date(message.updatedAt).getTime() >
              new Date(message.createdAt).getTime() && (
              <span className="edited-label">Edited</span>
            )}

          <span className="message-time">
            {messageTime}
          </span>

          <span
            className={`read-check ${
              message.read ? "message-read" : ""
            }`}
            title={message.read ? "Read" : "Sent"}
            aria-label={message.read ? "Read" : "Sent"}
          >
            {message.read ? (
              <CheckCheck size={15} />
            ) : (
              <Check size={15} />
            )}
          </span>
        </div>
      )}
    </div>
  );
}
