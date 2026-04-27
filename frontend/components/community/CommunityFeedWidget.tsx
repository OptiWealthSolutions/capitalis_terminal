"use client";

import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import Link from "next/link";
import { Users, ThumbsUp } from "lucide-react";

interface MiniPost {
  id: string;
  content: string;
  ticker: string | null;
  created_at: string;
  upvotes: number;
  author: { display_name: string | null; email: string; initials: string };
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function CommunityFeedWidget() {
  const { data, isLoading } = useQuery<{ posts: MiniPost[] }>({
    queryKey: ["community-posts-widget"],
    queryFn:  () => get("/community/posts", { limit: 5, offset: 0 }),
    staleTime: 60_000,
  });

  const posts = data?.posts ?? [];

  if (isLoading) {
    return (
      <section style={{ marginBottom: 20 }}>
        <div className="rounded border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
            <Users size={13} style={{ color: "var(--orange)" }} />
            <span style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--t2)" }}>
              Community Feed
            </span>
          </div>
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 40 }} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (posts.length === 0) return null;

  return (
    <section style={{ marginBottom: 20 }}>
      <div className="rounded border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <Users size={13} style={{ color: "var(--orange)" }} />
            <span style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--t2)" }}>
              Community Feed
            </span>
          </div>
          <Link
            href="/community"
            style={{ fontSize: "0.62rem", color: "var(--orange)", textDecoration: "none" }}
          >
            View all →
          </Link>
        </div>

        {/* Posts */}
        {posts.map((p, i) => {
          const authorName = p.author.display_name || p.author.email.split("@")[0];
          const isLast = i === posts.length - 1;
          return (
            <div
              key={p.id}
              style={{
                padding: "10px 16px",
                borderBottom: isLast ? "none" : "1px solid var(--border)",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {/* Author row */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  background: "var(--orange-dim)", border: "1px solid var(--orange-border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--orange)", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", fontSize: "0.6rem",
                }}>
                  {p.author.initials}
                </div>
                <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--t2)" }}>{authorName}</span>
                {p.ticker && (
                  <span style={{ fontSize: "0.58rem", fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "var(--orange)", padding: "1px 5px", background: "var(--orange-dim)", border: "1px solid var(--orange-border)", borderRadius: 3 }}>
                    ${p.ticker}
                  </span>
                )}
                <span style={{ fontSize: "0.6rem", color: "var(--t3)", marginLeft: "auto" }}>{timeAgo(p.created_at)}</span>
              </div>

              {/* Content preview */}
              <p style={{
                fontSize: "0.72rem", color: "var(--t1)", lineHeight: 1.4,
                overflow: "hidden", display: "-webkit-box",
                WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                wordBreak: "break-word",
              }}>
                {p.content}
              </p>

              {p.upvotes > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 4, color: "var(--t3)", fontSize: "0.6rem" }}>
                  <ThumbsUp size={9} />
                  <span>{p.upvotes}</span>
                </div>
              )}
            </div>
          );
        })}

        {/* Footer link */}
        <Link
          href="/community"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "8px", borderTop: "1px solid var(--border)",
            fontSize: "0.65rem", color: "var(--orange)", textDecoration: "none",
            transition: "background 0.1s",
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--bg-hover)")}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
        >
          Share your ideas in Community →
        </Link>
      </div>
    </section>
  );
}
