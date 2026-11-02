import { useState } from "react";
import {
  X,
  Mail,
  Check,
  Trash2,
  Ban,
  LoaderCircle,
  MessageCircle,
} from "lucide-react";

import Avatar from "./Avatar.jsx";
import { api } from "../api.js";

import "./MessageRequestsModal.css";

export default function MessageRequestsModal({
  requests = [],
  loading = false,
  onClose,
  onRequestUpdated,
  onAccepted,
  showNotice,
}) {
  const [processingId, setProcessingId] = useState(null);

  // Handle accepting, rejecting, deleting, or blocking a request
  async function handleAction(userId, action) {
    if (!userId || processingId) return;

    setProcessingId(userId);

    try {
      switch (action) {
        case "accept":
          await api.acceptMessageRequest(userId);
          showNotice?.("Message request accepted.");
          onAccepted?.(userId);
          break;

        case "reject":
          await api.rejectMessageRequest(userId);
          showNotice?.("Message request rejected.");
          break;

        case "delete":
          await api.deleteMessageRequest(userId);
          showNotice?.("Message request deleted.");
          break;

        case "block":
          await api.blockConversation(userId);
          showNotice?.("User blocked.");
          break;

        default:
          return;
      }

      onRequestUpdated?.();
    } catch (error) {
      console.error(
        `Could not ${action} message request:`,
        error
      );

      showNotice?.(
        error.message || `Could not ${action} this request.`
      );
    } finally {
      setProcessingId(null);
    }
  }

  // Get the message preview
  function getMessagePreview(request) {
    if (request.message?.text) {
      return request.message.text;
    }

    if (request.message?.attachment) {
      return "Sent you an attachment";
    }

    return "Sent you a message request";
  }

  // Get the sender's user ID
  function getUserId(request) {
    return request.user?._id || request.user?.id;
  }

  return (
    <div
      className="message-requests-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <section
        className="message-requests-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="message-requests-title"
      >
        {/* HEADER */}
        <header className="message-requests-header">
          <div className="message-requests-heading">
            <span className="message-requests-heading-icon">
              <Mail size={20} />
            </span>

            <div>
              <h2 id="message-requests-title">
                Message Requests
              </h2>

              <p>
                Review messages from people you haven't accepted.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="message-requests-close"
            onClick={onClose}
            aria-label="Close message requests"
          >
            <X size={20} />
          </button>
        </header>

        {/* CONTENT */}
        <div className="message-requests-content">
          {loading ? (
            <div className="message-requests-state">
              <LoaderCircle
                className="requests-spinner"
                size={28}
              />

              <p>Loading message requests...</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="message-requests-state">
              <span className="requests-empty-icon">
                <MessageCircle size={30} />
              </span>

              <h3>No message requests</h3>

              <p>
                When someone new sends you a message, it will appear here.
              </p>
            </div>
          ) : (
            <div className="message-request-list">
              {requests.map((request) => {
                const userId = getUserId(request);
                const isProcessing = processingId === userId;

                return (
                  <article
                    className="message-request-card"
                    key={request.conversationKey || userId}
                  >
                    {/* USER AND MESSAGE */}
                    <div className="message-request-main">
                      <Avatar
                        user={request.user}
                        size="48"
                      />

                      <div className="message-request-details">
                        <h3>
                          {request.user?.username || "Unknown user"}
                        </h3>

                        <p className="message-request-preview">
                          {getMessagePreview(request)}
                        </p>

                        {request.createdAt && (
                          <time
                            dateTime={new Date(
                              request.createdAt
                            ).toISOString()}
                          >
                            {new Date(
                              request.createdAt
                            ).toLocaleDateString()}
                          </time>
                        )}
                      </div>
                    </div>

                    {/* ATTACHMENT */}
                    {request.message?.attachment?.url && (
                      <a
                        className="message-request-attachment"
                        href={request.message.attachment.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View attachment
                      </a>
                    )}

                    {/* ACTION BUTTONS */}
                    <div className="message-request-actions">
                      <button
                        type="button"
                        className="request-action accept"
                        disabled={isProcessing || !userId}
                        onClick={() =>
                          handleAction(userId, "accept")
                        }
                      >
                        {isProcessing ? (
                          <LoaderCircle
                            size={15}
                            className="requests-spinner"
                          />
                        ) : (
                          <Check size={15} />
                        )}

                        Accept
                      </button>

                      <button
                        type="button"
                        className="request-action reject"
                        disabled={isProcessing || !userId}
                        onClick={() =>
                          handleAction(userId, "reject")
                        }
                      >
                        <X size={15} />
                        Reject
                      </button>

                      <button
                        type="button"
                        className="request-action delete"
                        disabled={isProcessing || !userId}
                        onClick={() =>
                          handleAction(userId, "delete")
                        }
                        title="Delete request"
                      >
                        <Trash2 size={15} />
                        Delete
                      </button>

                      <button
                        type="button"
                        className="request-action block"
                        disabled={isProcessing || !userId}
                        onClick={() =>
                          handleAction(userId, "block")
                        }
                        title="Block user"
                      >
                        <Ban size={15} />
                        Block
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <footer className="message-requests-footer">
          <button
            type="button"
            onClick={onClose}
          >
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}