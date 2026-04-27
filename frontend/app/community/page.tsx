"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SkeletonBlock } from "@/components/ui/LoadingSpinner";
import {
  ThumbsUp, Trash2, Link2, Image as ImageIcon,
  Send, TrendingUp, BarChart2, ChevronDown, ExternalLink,
  Users,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
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
        <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--t1)", lineHeight: 1.4 }}>
          {poll.question}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {poll.options.map(opt => {
          const isSelected = poll.user_vote === opt.id;
          const showResults = voted;
          return (
            <button
              key={opt.id}
              onClick={() => !voteMut.isPending && voteMut.mutate(opt.id)}
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
              onMouseEnter={e => { if (!voted) (e.currentTarget.style.borderColor = "var(--border-hi)"); }}
              onMouseLeave={e => { if (!voted) (e.currentTarget.style.borderColor = isSelected ? "var(--orange-border)" : "var(--border)"); }}
            >
              {/* Progress fill */}
              {showResults && (
                <div style={{
                  position: "absolute", left: 0, top: 0, height: "100%",
                  width: `${opt.pct}%`,
                  background: isSelected ? "rgba(122,167,232,0.12)" : "rgba(255,255,255,0.03)",
                  transition: "width 0.5s",
                }} />
              )}
              <span style={{ position: "relative", fontSize: "0.8rem", color: isSelected ? "var(--orange)" : "var(--t1)", fontWeight: isSelected ? 600 : 400 }}>
                {isSelected && "✓ "}{opt.text}
              </span>
              {showResults && (
                <span style={{ position: "relative", fontSize: "0.72rem", fontWeight: 600, color: isSelected ? "var(--orange)" : "var(--t3)", fontFamily: "JetBrains Mono, monospace", flexShrink: 0, marginLeft: 8 }}>
                  {opt.pct.toFixed(0)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: "0.65rem", color: "var(--t3)" }}>
        {poll.total_votes} vote{poll.total_votes !== 1 ? "s" : ""} · {timeAgo(poll.created_at)}
        {!voted && <span style={{ marginLeft: 8, color: "var(--orange)" }}>Click to vote</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post card
// ---------------------------------------------------------------------------
function PostCard({ post: p, currentUserId }: { post: Post; currentUserId: string }) {
  const qc = useQueryClient();
  const upvoteMut = useMutation({
    mutationFn: () => post<{ upvoted: boolean; upvotes: number }>(`/community/posts/${p.id}/upvote`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-posts"] }),
  });
  const deleteMut = useMutation({
    mutationFn: () => del<void>(`/community/posts/${p.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-posts"] }),
  });

  const isOwn = p.author.email === currentUserId; // we compare against user sub
  const authorName = p.author.display_name || p.author.email.split("@")[0];

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "16px 20px", transition: "border-color 0.15s" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-hi)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {/* Author row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
          background: "var(--orange-dim)", border: "1px solid var(--orange-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--orange)", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem",
        }}>
          {p.author.initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--t1)" }}>{authorName}</span>
          <span style={{ fontSize: "0.62rem", color: "var(--t3)", marginLeft: 8 }}>{timeAgo(p.created_at)}</span>
        </div>
        {p.ticker && (
          <span style={{ fontSize: "0.62rem", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "var(--orange)", padding: "2px 8px", background: "var(--orange-dim)", border: "1px solid var(--orange-border)", borderRadius: 4 }}>
            ${p.ticker}
          </span>
        )}
        {isOwn && (
          <button
            onClick={() => deleteMut.mutate()}
            disabled={deleteMut.isPending}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: 4, borderRadius: 4, flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}
            title="Delete post"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

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
// Compose box
// ---------------------------------------------------------------------------
function ComposeBox({ onSuccess }: { onSuccess: () => void }) {
  const [content, setContent]     = useState("");
  const [linkUrl, setLinkUrl]     = useState("");
  const [imageUrl, setImageUrl]   = useState("");
  const [ticker, setTicker]       = useState("");
  const [showExtra, setShowExtra] = useState(false);
  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: () => post<{ id: string }>("/community/posts", {
      content: content.trim(),
      link_url:  linkUrl.trim()  || null,
      image_url: imageUrl.trim() || null,
      ticker:    ticker.trim()   || null,
    }),
    onSuccess: () => {
      setContent(""); setLinkUrl(""); setImageUrl(""); setTicker(""); setShowExtra(false);
      qc.invalidateQueries({ queryKey: ["community-posts"] });
      onSuccess();
    },
  });

  const canSubmit = content.trim().length >= 1 && !createMut.isPending;

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "18px 20px", marginBottom: 16 }}>
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
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ fontSize: "0.6rem", color: "var(--t3)" }}>{content.length}/2000</span>
      </div>

      {/* Optional fields toggle */}
      <button
        onClick={() => setShowExtra(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: "0.68rem", marginTop: 8 }}
      >
        <ChevronDown size={12} style={{ transform: showExtra ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        Add link, image, ticker
      </button>

      {showExtra && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link2 size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />
            <input
              type="url"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              style={{ flex: 1, background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "6px 10px", fontSize: "0.75rem", color: "var(--t1)", outline: "none" }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--orange-border)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ImageIcon size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />
            <input
              type="url"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://i.imgur.com/… (image URL)"
              style={{ flex: 1, background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "6px 10px", fontSize: "0.75rem", color: "var(--t1)", outline: "none" }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--orange-border)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <TrendingUp size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />
            <input
              type="text"
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9.]/g, "").slice(0, 10))}
              placeholder="AAPL (optional ticker tag)"
              style={{ width: 160, background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "6px 10px", fontSize: "0.75rem", color: "var(--t1)", fontFamily: "JetBrains Mono, monospace", outline: "none" }}
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
// Page
// ---------------------------------------------------------------------------
export default function CommunityPage() {
  const { user } = useAuth();
  const [tab, setTab]   = useState<"feed" | "polls">("feed");
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

  const currentUserEmail = user?.email ?? "";

  return (
    <div className="p-4 sm:p-6 max-w-[900px] mx-auto fade-in">

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Users size={20} style={{ color: "var(--orange)" }} />
        <div>
          <p style={{ fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 2 }}>
            Capitalis
          </p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--t1)" }}>Community</h1>
        </div>
        {polls.length > 0 && (
          <span style={{ marginLeft: "auto", fontSize: "0.65rem", fontWeight: 600, padding: "3px 10px", background: "var(--orange-dim)", border: "1px solid var(--orange-border)", borderRadius: 20, color: "var(--orange)" }}>
            {polls.length} active poll{polls.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {(["feed", "polls"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "6px 16px", borderRadius: "var(--r-sm)", border: "1px solid", cursor: "pointer",
            fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", transition: "all 0.15s",
            background:  tab === t ? "var(--orange-dim)" : "var(--bg-hover)",
            borderColor: tab === t ? "var(--orange-border)" : "var(--border)",
            color:       tab === t ? "var(--orange)" : "var(--t2)",
          }}>
            {t === "feed" ? `Feed${posts.length ? ` (${posts.length}+)` : ""}` : `Polls${polls.length ? ` (${polls.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* ── Feed ── */}
      {tab === "feed" && (
        <>
          <ComposeBox onSuccess={() => setOffset(0)} />

          {postsLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-32" />)}
            </div>
          ) : posts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--t3)", fontSize: "0.82rem" }}>
              No posts yet. Be the first to share an idea.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {posts.map(p => (
                <PostCard key={p.id} post={p} currentUserId={currentUserEmail} />
              ))}
            </div>
          )}

          {/* Pagination */}
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
        </>
      )}

      {/* ── Polls ── */}
      {tab === "polls" && (
        <>
          {pollsLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {Array.from({ length: 2 }).map((_, i) => <SkeletonBlock key={i} className="h-40" />)}
            </div>
          ) : polls.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--t3)", fontSize: "0.82rem" }}>
              No active polls right now.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {polls.map(p => <PollCard key={p.id} poll={p} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
