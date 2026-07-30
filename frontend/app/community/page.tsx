"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SkeletonBlock } from "@/components/ui/LoadingSpinner";
import {
  ThumbsUp, Trash2, Link2, Image as ImageIcon,
  Send, TrendingUp, BarChart2, ChevronDown, ExternalLink,
  Users, Plus, X, Flame, Clock, Award, Filter,
  TrendingDown, Minus, Hash, Trophy, MessageSquare, QrCode,
} from "lucide-react";
import QRShareModal from "@/components/ui/QRShareModal";

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
  ticker: string | null; sentiment: string | null; created_at: string; upvotes: number;
  user_upvoted: boolean; author: PostAuthor;
}
interface LeaderEntry {
  rank: number; display_name: string; return_pct: number;
  positions_count: number; user_id: string;
}
interface LeaderResponse {
  top: LeaderEntry[]; me: LeaderEntry | null;
  me_rank: number | null; me_percentile: number | null; total_users: number;
}

type SortMode = "hot" | "new" | "top";
type Sentiment = "bullish" | "bearish" | "neutral";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function hotScore(upvotes: number, created_at: string): number {
  const hours = (Date.now() - new Date(created_at).getTime()) / 3_600_000;
  return upvotes / Math.pow(hours + 2, 1.5);
}

function colorFromStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffff;
  const hue = h % 360;
  return `oklch(0.45 0.14 ${hue})`;
}

const SENTIMENT_CONFIG: Record<Sentiment, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  bullish: {
    label: "Bullish", icon: <TrendingUp size={10} />,
    color: "oklch(0.62 0.18 145)", bg: "oklch(0.18 0.04 145)", border: "oklch(0.32 0.1 145)",
  },
  bearish: {
    label: "Bearish", icon: <TrendingDown size={10} />,
    color: "oklch(0.62 0.2 25)", bg: "oklch(0.18 0.05 25)", border: "oklch(0.32 0.12 25)",
  },
  neutral: {
    label: "Neutral", icon: <Minus size={10} />,
    color: "var(--t3)", bg: "var(--bg-hover)", border: "var(--card-border)",
  },
};

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return null;
  const cfg = SENTIMENT_CONFIG[sentiment as Sentiment];
  if (!cfg) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em",
      textTransform: "uppercase", padding: "2px 7px",
      borderRadius: "var(--r-full)", border: `1px solid ${cfg.border}`,
      background: cfg.bg, color: cfg.color, flexShrink: 0,
    }}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Poll card
// ---------------------------------------------------------------------------
function PollCard({ poll, compact = false }: { poll: Poll; compact?: boolean }) {
  const qc = useQueryClient();
  const voteMut = useMutation({
    mutationFn: (option_id: string) =>
      post<Poll>(`/community/polls/${poll.id}/vote`, { option_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-polls"] }),
  });
  const voted = poll.user_vote != null;

  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--card-border)",
      borderRadius: "var(--r-xl)", padding: compact ? "14px 16px" : "20px 22px",
      transition: "border-color 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <BarChart2 size={13} style={{ color: "var(--orange)", flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", display: "block", marginBottom: 3 }}>
            Poll · {timeAgo(poll.created_at)} ago
          </span>
          <p style={{ fontSize: compact ? "0.8rem" : "0.88rem", fontWeight: 600, color: "var(--t1)", lineHeight: 1.4 }}>
            {poll.question}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
                padding: "8px 12px", borderRadius: "var(--r-md)", border: "1px solid",
                textAlign: "left", cursor: voted ? "default" : "pointer",
                background: isSelected ? "var(--orange-dim)" : "var(--bg-inner)",
                borderColor: isSelected ? "var(--orange-border)" : "var(--card-border)",
                transition: "all 0.15s",
              }}
            >
              {voted && (
                <div style={{
                  position: "absolute", left: 0, top: 0, height: "100%", width: `${opt.pct}%`,
                  background: isSelected ? "rgba(122,167,232,0.1)" : "rgba(255,255,255,0.025)",
                  transition: "width 0.5s",
                }} />
              )}
              <span style={{ position: "relative", fontSize: "0.77rem", color: isSelected ? "var(--orange)" : "var(--t1)", fontWeight: isSelected ? 600 : 400 }}>
                {isSelected && "✓ "}{opt.text}
              </span>
              {voted && (
                <span style={{ position: "relative", fontSize: "0.7rem", fontWeight: 700, color: isSelected ? "var(--orange)" : "var(--t3)", flexShrink: 0, marginLeft: 8 }}>
                  {opt.pct.toFixed(0)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: "0.62rem", color: "var(--t3)", display: "flex", alignItems: "center", gap: 8 }}>
        <span>{poll.total_votes} vote{poll.total_votes !== 1 ? "s" : ""}</span>
        {!voted && <span style={{ color: "var(--orange)", fontWeight: 600 }}>· vote to see results</span>}
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
  const [qrOpen, setQrOpen] = useState(false);

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
    onError: () => setDeleteError("Delete failed."),
  });

  const isOwn = p.author.email === currentUserEmail;
  const authorName = p.author.display_name || p.author.email.split("@")[0];
  const avatarColor = colorFromStr(p.author.email);

  return (
    <div
      style={{
        background: "var(--bg-card)", border: "1px solid var(--card-border)",
        borderRadius: "var(--r-xl)", padding: "18px 22px",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--orange-border)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--card-border)")}
    >
      {/* Author row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: "var(--r-full)", flexShrink: 0,
          background: avatarColor, display: "flex", alignItems: "center", justifyContent: "center",
          color: "oklch(0.95 0.01 0)", fontWeight: 700, fontSize: "0.8rem",
        }}>
          {p.author.initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--t1)" }}>{authorName}</span>
            {p.sentiment && <SentimentBadge sentiment={p.sentiment} />}
          </div>
          <span style={{ fontSize: "0.62rem", color: "var(--t3)" }}>{timeAgo(p.created_at)} ago</span>
        </div>
        {p.ticker && (
          <span style={{
            fontSize: "0.65rem", fontWeight: 700, color: "var(--orange)",
            padding: "3px 8px", background: "var(--orange-dim)",
            border: "1px solid var(--orange-border)", borderRadius: "var(--r-full)",
          }}>
            ${p.ticker}
          </span>
        )}
        {isOwn && (
          <button
            onClick={() => { setDeleteError(null); deleteMut.mutate(); }}
            disabled={deleteMut.isPending}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: 4, borderRadius: "var(--r-sm)", flexShrink: 0, opacity: deleteMut.isPending ? 0.5 : 1 }}
            title="Delete post"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {deleteError && <p style={{ fontSize: "0.7rem", color: "var(--red)", marginBottom: 8 }}>{deleteError}</p>}

      <p style={{ fontSize: "0.84rem", color: "var(--t1)", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 12 }}>
        {p.content}
      </p>

      {p.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image_url} alt="" style={{ width: "100%", maxHeight: 340, objectFit: "cover", borderRadius: "var(--r-md)", marginBottom: 12, border: "1px solid var(--card-border)" }} />
      )}

      {p.link_url && (
        <a href={p.link_url} target="_blank" rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: "0.72rem", color: "var(--orange)", textDecoration: "none",
            marginBottom: 12, padding: "5px 10px", background: "var(--orange-dim)",
            border: "1px solid var(--orange-border)", borderRadius: "var(--r-md)",
          }}
        >
          <ExternalLink size={11} />
          {p.link_url.length > 55 ? p.link_url.slice(0, 52) + "…" : p.link_url}
        </a>
      )}

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, borderTop: "1px solid var(--card-border)", paddingTop: 10 }}>
        <button
          onClick={() => upvoteMut.mutate()}
          disabled={upvoteMut.isPending}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 12px", borderRadius: "var(--r-full)", border: "1px solid",
            cursor: "pointer", transition: "all 0.15s",
            background: p.user_upvoted ? "var(--orange-dim)" : "transparent",
            borderColor: p.user_upvoted ? "var(--orange-border)" : "var(--card-border)",
            color: p.user_upvoted ? "var(--orange)" : "var(--t3)",
            fontSize: "0.72rem", fontWeight: 600,
          }}
        >
          <ThumbsUp size={12} />
          {p.upvotes > 0 ? p.upvotes : "Upvote"}
        </button>
        <button
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 12px", borderRadius: "var(--r-full)", border: "1px solid var(--card-border)",
            cursor: "not-allowed", background: "transparent",
            color: "var(--t3)", fontSize: "0.72rem", opacity: 0.5,
          }}
          disabled
          title="Comments coming soon"
        >
          <MessageSquare size={12} />
          Reply
        </button>
        <button
          onClick={() => setQrOpen(true)}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 12px", borderRadius: "var(--r-full)", border: "1px solid var(--card-border)",
            cursor: "pointer", background: "transparent",
            color: "var(--t3)", fontSize: "0.72rem", transition: "all 0.15s",
          }}
          title="Share conviction"
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--orange-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--orange)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--card-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--t3)"; }}
        >
          <QrCode size={12} />
          Share
        </button>
      </div>

      {/* QR share modal */}
      {(() => {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const shareUrl = `${origin}/share/conviction?id=${p.id}`;
        const subtitle = p.content.length > 80 ? p.content.slice(0, 79) + "…" : p.content;
        return (
          <QRShareModal
            open={qrOpen}
            onClose={() => setQrOpen(false)}
            url={shareUrl}
            title="Share Conviction"
            subtitle={subtitle}
          />
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sentiment picker
// ---------------------------------------------------------------------------
function SentimentPicker({ value, onChange }: { value: Sentiment | null; onChange: (v: Sentiment | null) => void }) {
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {(["bullish", "bearish", "neutral"] as Sentiment[]).map(s => {
        const cfg = SENTIMENT_CONFIG[s];
        const active = value === s;
        return (
          <button key={s} type="button" onClick={() => onChange(active ? null : s)} style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: "var(--r-full)", border: "1px solid",
            cursor: "pointer", fontSize: "0.65rem", fontWeight: 600, transition: "all 0.15s",
            background: active ? cfg.bg : "transparent",
            borderColor: active ? cfg.border : "var(--card-border)",
            color: active ? cfg.color : "var(--t3)",
          }}>
            {cfg.icon}{cfg.label}
          </button>
        );
      })}
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
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [showExtra, setShowExtra] = useState(false);
  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: () => post<{ id: string }>("/community/posts", {
      content:   content.trim(),
      link_url:  linkUrl.trim()  || null,
      image_url: imageUrl.trim() || null,
      ticker:    ticker.trim()   || null,
      sentiment: sentiment       || null,
    }),
    onSuccess: () => {
      setContent(""); setLinkUrl(""); setImageUrl(""); setTicker(""); setSentiment(null); setShowExtra(false);
      qc.invalidateQueries({ queryKey: ["community-posts"] });
      qc.invalidateQueries({ queryKey: ["community-posts-widget"] });
      onSuccess();
    },
  });

  const canSubmit = content.trim().length >= 1 && !createMut.isPending;
  const inputStyle = {
    background: "var(--bg-inner)", border: "1px solid var(--card-border)",
    borderRadius: "var(--r-md)", padding: "7px 10px",
    fontSize: "0.77rem", color: "var(--t1)", outline: "none", fontFamily: "inherit",
  };

  return (
    <div>
      <textarea
        value={content} onChange={e => setContent(e.target.value)}
        placeholder="Share an analysis, investment thesis, or market observation…"
        maxLength={2000} rows={3}
        style={{ ...inputStyle, width: "100%", resize: "vertical", minHeight: 76, lineHeight: 1.55, fontSize: "0.84rem" }}
        onFocus={e => (e.currentTarget.style.borderColor = "var(--orange-border)")}
        onBlur={e => (e.currentTarget.style.borderColor = "var(--card-border)")}
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <SentimentPicker value={sentiment} onChange={setSentiment} />
        <span style={{ fontSize: "0.6rem", color: "var(--t3)" }}>{content.length}/2000</span>
      </div>

      <button onClick={() => setShowExtra(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: "0.68rem", marginTop: 10 }}
      >
        <ChevronDown size={12} style={{ transform: showExtra ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        Attach link, image, ticker
      </button>

      {showExtra && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { icon: <Link2 size={12} style={{ color: "var(--t3)", flexShrink: 0 }} />, value: linkUrl, set: setLinkUrl, placeholder: "https://…", type: "url" },
            { icon: <ImageIcon size={12} style={{ color: "var(--t3)", flexShrink: 0 }} />, value: imageUrl, set: setImageUrl, placeholder: "Image URL", type: "url" },
          ].map(({ icon, value, set, placeholder, type }, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {icon}
              <input type={type} value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
                style={{ ...inputStyle, flex: 1 }}
                onFocus={e => (e.currentTarget.style.borderColor = "var(--orange-border)")}
                onBlur={e => (e.currentTarget.style.borderColor = "var(--card-border)")}
              />
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Hash size={12} style={{ color: "var(--t3)", flexShrink: 0 }} />
            <input type="text" value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9.]/g, "").slice(0, 10))}
              placeholder="AAPL"
              style={{ ...inputStyle, width: 120 }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--orange-border)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--card-border)")}
            />
          </div>
        </div>
      )}

      {createMut.isError && <p style={{ fontSize: "0.72rem", color: "var(--red)", marginTop: 8 }}>Failed to post. Try again.</p>}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button onClick={() => createMut.mutate()} disabled={!canSubmit} className="btn-primary"
          style={{ borderRadius: "var(--r-md)", display: "flex", alignItems: "center", gap: 6, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? "pointer" : "not-allowed" }}
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

  const canSubmit = question.trim().length >= 5 && options.filter(o => o.trim()).length >= 2 && !createMut.isPending;
  const inputStyle = {
    background: "var(--bg-inner)", border: "1px solid var(--card-border)",
    borderRadius: "var(--r-md)", padding: "7px 10px",
    fontSize: "0.77rem", color: "var(--t1)", outline: "none", fontFamily: "inherit",
  };

  return (
    <div>
      <input type="text" value={question} onChange={e => setQuestion(e.target.value)}
        placeholder="Your question (e.g. Which sector leads Q3?)" maxLength={500}
        style={{ ...inputStyle, width: "100%", fontSize: "0.84rem" }}
        onFocus={e => (e.currentTarget.style.borderColor = "var(--orange-border)")}
        onBlur={e => (e.currentTarget.style.borderColor = "var(--card-border)")}
      />
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {options.map((opt, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "0.6rem", color: "var(--t3)", minWidth: 16, textAlign: "right" }}>{i + 1}.</span>
            <input type="text" value={opt}
              onChange={e => setOptions(prev => prev.map((o, idx) => idx === i ? e.target.value : o))}
              placeholder={`Option ${i + 1}`} maxLength={200}
              style={{ ...inputStyle, flex: 1 }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--orange-border)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--card-border)")}
            />
            {options.length > 2 && (
              <button onClick={() => setOptions(prev => prev.filter((_, idx) => idx !== i))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: 4 }}>
                <X size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      {options.length < 6 && (
        <button onClick={() => setOptions(prev => [...prev, ""])}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "var(--orange)", fontSize: "0.68rem", marginTop: 8 }}
        >
          <Plus size={12} /> Add option
        </button>
      )}
      {createMut.isError && <p style={{ fontSize: "0.72rem", color: "var(--red)", marginTop: 8 }}>Failed to create poll.</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button onClick={() => createMut.mutate()} disabled={!canSubmit} className="btn-primary"
          style={{ borderRadius: "var(--r-md)", display: "flex", alignItems: "center", gap: 6, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? "pointer" : "not-allowed" }}
        >
          <BarChart2 size={13} />
          {createMut.isPending ? "Creating…" : "Create Poll"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compose box
// ---------------------------------------------------------------------------
function ComposeBox({ onSuccess }: { onSuccess: () => void }) {
  const { user } = useAuth();
  const [mode, setMode] = useState<"post" | "poll">("post");
  const authorName = (user as { display_name?: string; email?: string } | null)?.display_name || ((user as { email?: string } | null)?.email || "").split("@")[0] || "?";
  const avatarColor = colorFromStr((user as { email?: string } | null)?.email || "x");
  const initials = authorName[0]?.toUpperCase() || "?";

  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--card-border)",
      borderRadius: "var(--r-xl)", padding: "18px 22px", marginBottom: 16,
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{
          width: 34, height: 34, borderRadius: "var(--r-full)", flexShrink: 0,
          background: avatarColor, display: "flex", alignItems: "center", justifyContent: "center",
          color: "oklch(0.95 0.01 0)", fontWeight: 700, fontSize: "0.8rem",
        }}>
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
            {(["post", "poll"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: "3px 12px", borderRadius: "var(--r-full)", border: "1px solid",
                cursor: "pointer", fontSize: "0.65rem", fontWeight: 700,
                letterSpacing: "0.05em", textTransform: "uppercase", transition: "all 0.15s",
                background:  mode === m ? "var(--orange-dim)" : "transparent",
                borderColor: mode === m ? "var(--orange-border)" : "var(--card-border)",
                color:       mode === m ? "var(--orange)" : "var(--t3)",
              }}>
                {m === "post" ? "Post" : "Poll"}
              </button>
            ))}
          </div>
          {mode === "post" ? <ComposePost onSuccess={onSuccess} /> : <ComposePoll onSuccess={onSuccess} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar: Leaderboard
// ---------------------------------------------------------------------------
function LeaderboardCard() {
  const { data, isLoading } = useQuery<LeaderResponse>({
    queryKey: ["community-leaderboard"],
    queryFn: () => get("/community/leaderboard", { limit: 5 }),
    staleTime: 1_800_000,
  });

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: 8 }}>
        <Trophy size={14} style={{ color: "var(--orange)" }} />
        <span style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontWeight: 700, fontSize: "0.8rem", color: "var(--t1)" }}>
          Performance ranking
        </span>
      </div>
      <div style={{ padding: "8px 0" }}>
        {isLoading ? (
          <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
            {[0,1,2].map(i => <SkeletonBlock key={i} className="h-6" />)}
          </div>
        ) : !data || data.top.length === 0 ? (
          <p style={{ padding: "12px 18px", fontSize: "0.72rem", color: "var(--t3)" }}>No portfolio data yet.</p>
        ) : (
          <>
            {data.top.slice(0, 5).map((entry, i) => {
              const isMe = data.me?.user_id === entry.user_id;
              return (
                <div key={entry.user_id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 18px",
                  background: isMe ? "var(--orange-dim)" : "transparent",
                  borderLeft: isMe ? "2px solid var(--orange)" : "2px solid transparent",
                }}>
                  <span style={{ fontSize: "0.72rem", minWidth: 20, textAlign: "center" }}>
                    {i < 3 ? medals[i] : `#${i + 1}`}
                  </span>
                  <div style={{
                    width: 26, height: 26, borderRadius: "var(--r-full)", flexShrink: 0,
                    background: colorFromStr(entry.display_name),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "oklch(0.95 0.01 0)", fontWeight: 700, fontSize: "0.68rem",
                  }}>
                    {entry.display_name[0]?.toUpperCase()}
                  </div>
                  <span style={{ flex: 1, fontSize: "0.75rem", color: "var(--t1)", fontWeight: isMe ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {isMe ? "You" : entry.display_name}
                  </span>
                  <span style={{
                    fontSize: "0.72rem", fontWeight: 700, flexShrink: 0,
                    color: entry.return_pct >= 0 ? "oklch(0.62 0.18 145)" : "oklch(0.62 0.2 25)",
                  }}>
                    {entry.return_pct >= 0 ? "+" : ""}{entry.return_pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
            {data.me_rank && data.me_rank > 5 && (
              <div style={{ padding: "8px 18px 10px", borderTop: "1px solid var(--card-border)" }}>
                <span style={{ fontSize: "0.65rem", color: "var(--t3)" }}>
                  Your rank: <strong style={{ color: "var(--t2)" }}>#{data.me_rank}</strong>
                  {data.me_percentile != null && ` · top ${100 - data.me_percentile}%`}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar: Trending tickers
// ---------------------------------------------------------------------------
function TrendingCard({ posts }: { posts: Post[] }) {
  const tickers = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of posts) {
      if (p.ticker) counts[p.ticker] = (counts[p.ticker] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [posts]);

  if (tickers.length === 0) return null;

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: 8 }}>
        <TrendingUp size={14} style={{ color: "var(--orange)" }} />
        <span style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontWeight: 700, fontSize: "0.8rem", color: "var(--t1)" }}>
          Trending tickers
        </span>
      </div>
      <div style={{ padding: "12px 18px", display: "flex", flexWrap: "wrap", gap: 7 }}>
        {tickers.map(([ticker, count]) => (
          <span key={ticker} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: "var(--r-full)",
            background: "var(--orange-dim)", border: "1px solid var(--orange-border)",
            fontSize: "0.68rem", fontWeight: 700, color: "var(--orange)",
          }}>
            ${ticker}
            <span style={{ fontSize: "0.58rem", color: "var(--t3)", fontWeight: 400 }}>{count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function CommunityPage() {
  const { user } = useAuth();
  const [offset, setOffset]               = useState(0);
  const [sortMode, setSortMode]           = useState<SortMode>("hot");
  const [tickerFilter, setTickerFilter]   = useState<string | null>(null);
  const [tickerInput, setTickerInput]     = useState("");
  const [showTickerInput, setShowTickerInput] = useState(false);
  const LIMIT = 30;

  const { data: pollsData, isLoading: pollsLoading } = useQuery<{ polls: Poll[] }>({
    queryKey: ["community-polls"],
    queryFn:  () => get("/community/polls"),
    staleTime: 60_000,
  });

  const { data: postsData, isLoading: postsLoading } = useQuery<{ posts: Post[]; offset: number; limit: number }>({
    queryKey: ["community-posts", offset, tickerFilter],
    queryFn:  () => get("/community/posts", { limit: LIMIT, offset, ...(tickerFilter ? { ticker: tickerFilter } : {}) }),
    staleTime: 30_000,
  });

  const polls = pollsData?.polls ?? [];
  const posts = postsData?.posts ?? [];
  const hasMore = posts.length === LIMIT;

  const sortedPosts = useMemo(() => {
    const sorted = [...posts];
    if (sortMode === "hot") sorted.sort((a, b) => hotScore(b.upvotes, b.created_at) - hotScore(a.upvotes, a.created_at));
    else if (sortMode === "top") sorted.sort((a, b) => b.upvotes - a.upvotes);
    return sorted;
  }, [posts, sortMode]);

  const currentUserEmail = (user as { email?: string } | null)?.email ?? "";

  const SORT_OPTIONS: { key: SortMode; label: string; icon: React.ReactNode }[] = [
    { key: "hot",  label: "Hot",  icon: <Flame size={12} /> },
    { key: "new",  label: "New",  icon: <Clock size={12} /> },
    { key: "top",  label: "Top",  icon: <Award size={12} /> },
  ];

  function applyTickerFilter() {
    const t = tickerInput.trim().toUpperCase().replace(/[^A-Z0-9.]/g, "").slice(0, 10);
    if (t) { setTickerFilter(t); setOffset(0); }
    setShowTickerInput(false);
    setTickerInput("");
  }

  return (
    <div className="fade-in" style={{ padding: "28px 32px", maxWidth: 1600, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>
          Capitalis
        </p>
        <h1 style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontWeight: 700, fontSize: "1.75rem", letterSpacing: "-0.015em", color: "var(--t1)", lineHeight: 1.2, margin: 0 }}>
          Community
        </h1>
      </div>

      {/* 2-col layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>

        {/* Left: feed */}
        <div>
          <ComposeBox onSuccess={() => setOffset(0)} />

          {/* Sort + filter bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {SORT_OPTIONS.map(({ key, label, icon }) => (
                <button key={key} onClick={() => setSortMode(key)} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 12px", borderRadius: "var(--r-full)", border: "1px solid",
                  cursor: "pointer", fontSize: "0.68rem", fontWeight: 600, transition: "all 0.15s",
                  background:  sortMode === key ? "var(--orange-dim)" : "transparent",
                  borderColor: sortMode === key ? "var(--orange-border)" : "var(--card-border)",
                  color:       sortMode === key ? "var(--orange)" : "var(--t3)",
                }}>
                  {icon}{label}
                </button>
              ))}
            </div>

            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              {tickerFilter && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "4px 10px", borderRadius: "var(--r-full)",
                  background: "var(--orange-dim)", border: "1px solid var(--orange-border)",
                  fontSize: "0.65rem", fontWeight: 700, color: "var(--orange)",
                }}>
                  ${tickerFilter}
                  <button onClick={() => { setTickerFilter(null); setOffset(0); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--orange)", padding: 0, display: "flex" }}>
                    <X size={11} />
                  </button>
                </span>
              )}

              {showTickerInput ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <input autoFocus type="text" value={tickerInput}
                    onChange={e => setTickerInput(e.target.value.toUpperCase().replace(/[^A-Z0-9.]/g, "").slice(0, 10))}
                    onKeyDown={e => { if (e.key === "Enter") applyTickerFilter(); if (e.key === "Escape") setShowTickerInput(false); }}
                    placeholder="AAPL"
                    style={{
                      width: 72, background: "var(--bg-inner)", border: "1px solid var(--orange-border)",
                      borderRadius: "var(--r-md)", padding: "4px 8px",
                      fontSize: "0.72rem", color: "var(--t1)", outline: "none",
                    }}
                  />
                  <button onClick={applyTickerFilter} style={{ padding: "4px 10px", borderRadius: "var(--r-md)", border: "1px solid var(--orange-border)", background: "var(--orange-dim)", color: "var(--orange)", cursor: "pointer", fontSize: "0.65rem", fontWeight: 600 }}>
                    Go
                  </button>
                  <button onClick={() => setShowTickerInput(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)" }}>
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowTickerInput(true)} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 10px", borderRadius: "var(--r-full)", border: "1px solid var(--card-border)",
                  cursor: "pointer", background: "transparent", color: "var(--t3)", fontSize: "0.65rem",
                }}>
                  <Filter size={11} /> Filter ticker
                </button>
              )}
            </div>
          </div>

          {/* Feed */}
          {(postsLoading || pollsLoading) ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-32" />)}
            </div>
          ) : sortedPosts.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "48px 0", color: "var(--t3)", fontSize: "0.84rem",
              border: "1px dashed var(--card-border)", borderRadius: "var(--r-xl)",
            }}>
              {tickerFilter ? `No posts tagged $${tickerFilter}.` : "No posts yet. Be the first to share an idea."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sortedPosts.map(p => <PostCard key={p.id} post={p} currentUserEmail={currentUserEmail} />)}
            </div>
          )}

          {/* Pagination */}
          {!postsLoading && (
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
              {offset > 0 && (
                <button onClick={() => setOffset(Math.max(0, offset - LIMIT))} style={{ padding: "6px 16px", borderRadius: "var(--r-full)", border: "1px solid var(--card-border)", background: "transparent", color: "var(--t2)", fontSize: "0.72rem", cursor: "pointer", fontWeight: 600 }}>
                  ← Previous
                </button>
              )}
              {hasMore && (
                <button onClick={() => setOffset(offset + LIMIT)} style={{ padding: "6px 16px", borderRadius: "var(--r-full)", border: "1px solid var(--card-border)", background: "transparent", color: "var(--t2)", fontSize: "0.72rem", cursor: "pointer", fontWeight: 600 }}>
                  Load more →
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 24 }}>

          {polls.length > 0 && (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: 8 }}>
                <BarChart2 size={14} style={{ color: "var(--orange)" }} />
                <span style={{ fontFamily: "Manrope, DM Sans, sans-serif", fontWeight: 700, fontSize: "0.8rem", color: "var(--t1)" }}>
                  Active polls
                  <span style={{ marginLeft: 6, fontSize: "0.65rem", fontWeight: 400, color: "var(--t3)" }}>{polls.length}</span>
                </span>
              </div>
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                {polls.slice(0, 2).map(p => <PollCard key={p.id} poll={p} compact />)}
                {polls.length > 2 && (
                  <p style={{ fontSize: "0.65rem", color: "var(--t3)", textAlign: "center" }}>+{polls.length - 2} more polls in feed</p>
                )}
              </div>
            </div>
          )}

          <LeaderboardCard />
          <TrendingCard posts={posts} />

          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", borderRadius: "var(--r-xl)",
            border: "1px solid var(--card-border)", background: "var(--bg-card)",
          }}>
            <Users size={13} style={{ color: "var(--orange)" }} />
            <span style={{ fontSize: "0.72rem", color: "var(--t2)" }}>
              <strong style={{ color: "var(--t1)" }}>{posts.length}</strong> post{posts.length !== 1 ? "s" : ""} · <strong style={{ color: "var(--t1)" }}>{polls.length}</strong> poll{polls.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
