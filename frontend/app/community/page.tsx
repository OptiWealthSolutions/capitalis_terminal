"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SkeletonBlock } from "@/components/ui/LoadingSpinner";
import {
  ThumbsUp, Trash2, Link2, Image as ImageIcon,
  Send, TrendingUp, BarChart2, ChevronDown, ExternalLink,
  Users, Plus, X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PollOption { id: string; text: string; votes: number; pct: number; }
interface Poll {
  id: string; question: string; created_at: string;
  options: PollOption[]; total_votes: number; user_vote: string | null;
}
interface PostAuthor { email: string; display_name: string | null; initials: string; }
interface Post {
  id: string; content: string; link_url: string | null; image_url: string | null;
  ticker: string | null; created_at: string; upvotes: number;
  user_upvoted: boolean; author: PostAuthor;
}

type FeedItem =
  | { type: "post"; data: Post;  key: string; date: string }
  | { type: "poll"; data: Poll;  key: string; date: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Poll card
// ---------------------------------------------------------------------------
function PollCard({ poll }: { poll: Poll }) {
  const qc = useQueryClient();
  const voteMut = useMutation({
    mutationFn: (option_id: string) =>
      post<Poll>(`/community/polls/${poll.id}/vote`, { option_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-polls"] }),
  });
  const voted = poll.user_vote != null;

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
        <BarChart2 size={15} style={{ color: "var(--orange)", flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)", display: "block", marginBottom: 4 }}>
            Community Poll · {timeAgo(poll.created_at)}
          </span>
          <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--t1)", lineHeight: 1.4 }}>
            {poll.question}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {poll.options.map(opt => {
          const isSelected = poll.user_vote === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => !voteMut.isPending && !voted && voteMut.mutate(opt.id)}
              disabled={voteMut.isPending}
              style={{
                position: "relative", overflow: "hidden",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 14px", borderRadius: "var(--r-sm)", border: "1px solid",
                textAlign: "left", cursor: voted ? "default" : "pointer",
                background: isSelected ? "var(--orange-dim)" : "var(--bg-hover)",
                borderColor: isSelected ? "var(--orange-border)" : "var(--border)",
                transition: "all 0.15s",
              }}
            >
              {voted && (
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${opt.pct}%`, background: isSelected ? "rgba(122,167,232,0.12)" : "rgba(255,255,255,0.03)", transition: "width 0.5s" }} />
              )}
              <span style={{ position: "relative", fontSize: "0.8rem", color: isSelected ? "var(--orange)" : "var(--t1)", fontWeight: isSelected ? 600 : 400 }}>
                {isSelected && "✓ "}{opt.text}
              </span>
              {voted && (
                <span style={{ position: "relative", fontSize: "0.72rem", fontWeight: 600, color: isSelected ? "var(--orange)" : "var(--t3)", fontFamily: "monospace", flexShrink: 0, marginLeft: 8 }}>
                  {opt.pct.toFixed(0)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: "0.65rem", color: "var(--t3)" }}>
        {poll.total_votes} vote{poll.total_votes !== 1 ? "s" : ""}
        {!voted && <span style={{ marginLeft: 8, color: "var(--orange)" }}>Click to vote</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post card
// ---------------------------------------------------------------------------
function PostCard({ post: p, currentUserEmail }: { post: Post; currentUserEmail: string }) {
  const qc = useQueryClient();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const upvoteMut = useMutation({
    mutationFn: () => post<{ upvoted: boolean; upvotes: number }>(`/community/posts/${p.id}/upvote`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-posts"] }),
  });
  const deleteMut = useMutation({
    mutationFn: () => del<void>(`/community/posts/${p.id}`),
    onSuccess: () => {
      setDeleteError(null);
      qc.invalidateQueries({ queryKey: ["community-posts"] });
      qc.invalidateQueries({ queryKey: ["community-posts-widget"] });
    },
    onError: () => setDeleteError("Delete failed. Try again."),
  });

  const isOwn = p.author.email === currentUserEmail;
  const authorName = p.author.display_name || p.author.email.split("@")[0];

  return (
    <div
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "16px 20px", transition: "border-color 0.15s" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-hi)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {/* Author row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
          background: "var(--orange-dim)", border: "1px solid var(--orange-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--orange)", fontWeight: 700, fontFamily: "monospace", fontSize: "0.78rem",
        }}>
          {p.author.initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--t1)" }}>{authorName}</span>
          <span style={{ fontSize: "0.62rem", color: "var(--t3)", marginLeft: 8 }}>{timeAgo(p.created_at)}</span>
        </div>
        {p.ticker && (
          <span style={{ fontSize: "0.62rem", fontWeight: 700, fontFamily: "monospace", color: "var(--orange)", padding: "2px 8px", background: "var(--orange-dim)", border: "1px solid var(--orange-border)", borderRadius: 4 }}>
            ${p.ticker}
          </span>
        )}
        {isOwn && (
          <button
            onClick={() => { setDeleteError(null); deleteMut.mutate(); }}
            disabled={deleteMut.isPending}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: 4, borderRadius: 4, flexShrink: 0, opacity: deleteMut.isPending ? 0.5 : 1 }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}
            title="Delete post"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {deleteError && (
        <p style={{ fontSize: "0.7rem", color: "var(--red)", marginBottom: 8 }}>{deleteError}</p>
      )}

      {/* Content */}
      <p style={{ fontSize: "0.82rem", color: "var(--t1)", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 10 }}>
        {p.content}
      </p>

      {/* Image */}
      {p.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image_url} alt="Post image" style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: "var(--r-sm)", marginBottom: 10, border: "1px solid var(--border)" }} />
      )}

      {/* Link */}
      {p.link_url && (
        <a href={p.link_url} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.72rem", color: "var(--orange)", textDecoration: "none", marginBottom: 10, padding: "5px 10px", background: "var(--orange-dim)", border: "1px solid var(--orange-border)", borderRadius: 4 }}
        >
          <ExternalLink size={11} />
          {p.link_url.length > 60 ? p.link_url.slice(0, 57) + "…" : p.link_url}
        </a>
      )}

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        <button
          onClick={() => upvoteMut.mutate()}
          disabled={upvoteMut.isPending}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: 4, border: "1px solid", cursor: "pointer", transition: "all 0.15s",
            background: p.user_upvoted ? "var(--orange-dim)" : "var(--bg-hover)",
            borderColor: p.user_upvoted ? "var(--orange-border)" : "var(--border)",
            color: p.user_upvoted ? "var(--orange)" : "var(--t3)",
            fontSize: "0.7rem", fontWeight: 600,
          }}
        >
          <ThumbsUp size={12} />
          {p.upvotes > 0 ? p.upvotes : "Like"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compose post
// ---------------------------------------------------------------------------
function ComposePost({ onSuccess }: { onSuccess: () => void }) {
  const [content, setContent]     = useState("");
  const [linkUrl, setLinkUrl]     = useState("");
  const [imageUrl, setImageUrl]   = useState("");
  const [ticker, setTicker]       = useState("");
  const [showExtra, setShowExtra] = useState(false);
  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: () => post<{ id: string }>("/community/posts", {
      content:   content.trim(),
      link_url:  linkUrl.trim()  || null,
      image_url: imageUrl.trim() || null,
      ticker:    ticker.trim()   || null,
    }),
    onSuccess: () => {
      setContent(""); setLinkUrl(""); setImageUrl(""); setTicker(""); setShowExtra(false);
      qc.invalidateQueries({ queryKey: ["community-posts"] });
      qc.invalidateQueries({ queryKey: ["community-posts-widget"] });
      onSuccess();
    },
  });

  const canSubmit = content.trim().length >= 1 && !createMut.isPending;

  return (
    <div>
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Share an analysis, investment idea, or market observation…"
        maxLength={2000}
        rows={3}
        style={{
          width: "100%", resize: "vertical", minHeight: 72,
          background: "var(--bg-base)", border: "1px solid var(--border)",
          borderRadius: "var(--r-sm)", padding: "10px 12px",
          fontSize: "0.82rem", color: "var(--t1)", lineHeight: 1.5,
          outline: "none", fontFamily: "inherit",
        }}
        onFocus={e => (e.currentTarget.style.borderColor = "var(--orange-border)")}
        onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: "0.6rem", color: "var(--t3)" }}>{content.length}/2000</span>
      </div>

      <button
        onClick={() => setShowExtra(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: "0.68rem", marginTop: 8 }}
      >
        <ChevronDown size={12} style={{ transform: showExtra ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        Add link, image, ticker
      </button>

      {showExtra && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { icon: <Link2 size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />, value: linkUrl, set: setLinkUrl, placeholder: "https://example.com", type: "url", style: { flex: 1 } },
            { icon: <ImageIcon size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />, value: imageUrl, set: setImageUrl, placeholder: "https://i.imgur.com/… (image URL)", type: "url", style: { flex: 1 } },
          ].map(({ icon, value, set, placeholder, type, style: inputStyle }, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {icon}
              <input
                type={type}
                value={value}
                onChange={e => set(e.target.value)}
                placeholder={placeholder}
                style={{ ...inputStyle, background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "6px 10px", fontSize: "0.75rem", color: "var(--t1)", outline: "none" }}
                onFocus={e => (e.currentTarget.style.borderColor = "var(--orange-border)")}
                onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
              />
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <TrendingUp size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />
            <input
              type="text"
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9.]/g, "").slice(0, 10))}
              placeholder="AAPL (optional ticker tag)"
              style={{ width: 160, background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "6px 10px", fontSize: "0.75rem", color: "var(--t1)", fontFamily: "monospace", outline: "none" }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--orange-border)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>
        </div>
      )}

      {createMut.isError && (
        <p style={{ fontSize: "0.72rem", color: "var(--red)", marginTop: 8 }}>Failed to post. Try again.</p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button
          onClick={() => createMut.mutate()}
          disabled={!canSubmit}
          className="btn-primary"
          style={{ borderRadius: "var(--r)", display: "flex", alignItems: "center", gap: 6, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? "pointer" : "not-allowed" }}
        >
          <Send size={13} />
          {createMut.isPending ? "Posting…" : "Post"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compose poll
// ---------------------------------------------------------------------------
function ComposePoll({ onSuccess }: { onSuccess: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions]   = useState(["", ""]);
  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: () => post("/community/polls", {
      question: question.trim(),
      options:  options.map(o => o.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      setQuestion(""); setOptions(["", ""]);
      qc.invalidateQueries({ queryKey: ["community-polls"] });
      onSuccess();
    },
  });

  const validOptions = options.filter(o => o.trim());
  const canSubmit = question.trim().length >= 5 && validOptions.length >= 2 && !createMut.isPending;

  function setOption(i: number, val: string) {
    setOptions(prev => prev.map((o, idx) => idx === i ? val : o));
  }
  function addOption() {
    if (options.length < 6) setOptions(prev => [...prev, ""]);
  }
  function removeOption(i: number) {
    if (options.length > 2) setOptions(prev => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <input
        type="text"
        value={question}
        onChange={e => setQuestion(e.target.value)}
        placeholder="Your question (e.g. Which sector will outperform in Q3?)"
        maxLength={500}
        style={{
          width: "100%", background: "var(--bg-base)", border: "1px solid var(--border)",
          borderRadius: "var(--r-sm)", padding: "10px 12px",
          fontSize: "0.82rem", color: "var(--t1)", outline: "none", fontFamily: "inherit",
        }}
        onFocus={e => (e.currentTarget.style.borderColor = "var(--orange-border)")}
        onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
      />
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {options.map((opt, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "0.62rem", color: "var(--t3)", fontFamily: "monospace", minWidth: 16 }}>{i + 1}.</span>
            <input
              type="text"
              value={opt}
              onChange={e => setOption(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              maxLength={200}
              style={{
                flex: 1, background: "var(--bg-base)", border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)", padding: "7px 10px",
                fontSize: "0.78rem", color: "var(--t1)", outline: "none", fontFamily: "inherit",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--orange-border)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
            />
            {options.length > 2 && (
              <button onClick={() => removeOption(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: 4 }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      {options.length < 6 && (
        <button
          onClick={addOption}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "var(--orange)", fontSize: "0.68rem", marginTop: 8 }}
        >
          <Plus size={12} /> Add option
        </button>
      )}

      {createMut.isError && (
        <p style={{ fontSize: "0.72rem", color: "var(--red)", marginTop: 8 }}>Failed to create poll. Try again.</p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button
          onClick={() => createMut.mutate()}
          disabled={!canSubmit}
          className="btn-primary"
          style={{ borderRadius: "var(--r)", display: "flex", alignItems: "center", gap: 6, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? "pointer" : "not-allowed" }}
        >
          <BarChart2 size={13} />
          {createMut.isPending ? "Creating…" : "Create Poll"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compose box (mode switcher: post | poll)
// ---------------------------------------------------------------------------
function ComposeBox({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<"post" | "poll">("post");

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "16px 20px", marginBottom: 16 }}>
      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {(["post", "poll"] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: "4px 14px", borderRadius: "var(--r-sm)", border: "1px solid", cursor: "pointer",
              fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", transition: "all 0.15s",
              background:  mode === m ? "var(--orange-dim)" : "var(--bg-hover)",
              borderColor: mode === m ? "var(--orange-border)" : "var(--border)",
              color:       mode === m ? "var(--orange)" : "var(--t3)",
            }}
          >
            {m === "post" ? "Post" : "Poll"}
          </button>
        ))}
      </div>

      {mode === "post" ? <ComposePost onSuccess={onSuccess} /> : <ComposePoll onSuccess={onSuccess} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function CommunityPage() {
  const { user } = useAuth();
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const { data: pollsData, isLoading: pollsLoading } = useQuery<{ polls: Poll[] }>({
    queryKey: ["community-polls"],
    queryFn:  () => get("/community/polls"),
    staleTime: 60_000,
  });

  const { data: postsData, isLoading: postsLoading } = useQuery<{ posts: Post[]; offset: number; limit: number }>({
    queryKey: ["community-posts", offset],
    queryFn:  () => get("/community/posts", { limit: LIMIT, offset }),
    staleTime: 30_000,
  });

  const polls = pollsData?.polls ?? [];
  const posts = postsData?.posts ?? [];
  const hasMore = posts.length === LIMIT;

  // Unified feed: merge polls + posts, sort by date desc
  const feedItems = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [
      ...posts.map(p  => ({ type: "post" as const, data: p,  key: `post-${p.id}`,  date: p.created_at })),
      ...polls.map(p  => ({ type: "poll" as const, data: p,  key: `poll-${p.id}`,  date: p.created_at })),
    ];
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [posts, polls]);

  const currentUserEmail = user?.email ?? "";

  return (
    <div className="p-4 sm:p-6 xl:px-8 max-w-[2000px] mx-auto fade-in">
      <div className="max-w-[920px] mx-auto">

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Users size={20} style={{ color: "var(--orange)" }} />
        <div>
          <p style={{ fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 2 }}>
            Capitalis
          </p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--t1)" }}>Community</h1>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {polls.length > 0 && (
            <span style={{ fontSize: "0.65rem", fontWeight: 600, padding: "3px 10px", background: "var(--orange-dim)", border: "1px solid var(--orange-border)", borderRadius: 20, color: "var(--orange)" }}>
              {polls.length} active poll{polls.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Compose box */}
      <ComposeBox onSuccess={() => setOffset(0)} />

      {/* Feed */}
      {(postsLoading || pollsLoading) ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-32" />)}
        </div>
      ) : feedItems.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--t3)", fontSize: "0.82rem" }}>
          No posts yet. Be the first to share an idea.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {feedItems.map(item =>
            item.type === "post"
              ? <PostCard key={item.key} post={item.data} currentUserEmail={currentUserEmail} />
              : <PollCard key={item.key} poll={item.data} />
          )}
        </div>
      )}

      {/* Pagination */}
      {!postsLoading && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
          {offset > 0 && (
            <button onClick={() => setOffset(Math.max(0, offset - LIMIT))} style={{ padding: "6px 16px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--bg-hover)", color: "var(--t2)", fontSize: "0.72rem", cursor: "pointer", fontWeight: 600 }}>
              ← Previous
            </button>
          )}
          {hasMore && (
            <button onClick={() => setOffset(offset + LIMIT)} style={{ padding: "6px 16px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--bg-hover)", color: "var(--t2)", fontSize: "0.72rem", cursor: "pointer", fontWeight: 600 }}>
              More →
            </button>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
