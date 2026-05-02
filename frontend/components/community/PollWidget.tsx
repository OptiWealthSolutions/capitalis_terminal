"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { BarChart2, Users } from "lucide-react";
import Link from "next/link";

interface PollOption { id: string; text: string; votes: number; pct: number; }
interface Poll {
  id: string; question: string; created_at: string;
  options: PollOption[]; total_votes: number; user_vote: string | null;
}

export default function PollWidget() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ polls: Poll[] }>({
    queryKey: ["community-polls"],
    queryFn:  () => get("/community/polls"),
    staleTime: 60_000,
  });

  const voteMut = useMutation({
    mutationFn: ({ pollId, optionId }: { pollId: string; optionId: string }) =>
      post<Poll>(`/community/polls/${pollId}/vote`, { option_id: optionId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-polls"] }),
  });

  const poll = data?.polls?.[0]; // show latest active poll

  if (isLoading) {
    return (
      <section style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ height: 12, width: 160, background: "var(--bg-hover)", borderRadius: 4, marginBottom: 12 }} />
        <div style={{ height: 8, width: "80%", background: "var(--bg-hover)", borderRadius: 4, marginBottom: 8 }} />
        <div style={{ height: 8, width: "60%", background: "var(--bg-hover)", borderRadius: 4 }} />
      </section>
    );
  }

  if (!poll) return null;

  const voted = poll.user_vote != null;

  return (
    <section style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "18px 20px", marginBottom: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BarChart2 size={13} style={{ color: "var(--orange)" }} />
          <span style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)" }}>
            Community Poll
          </span>
        </div>
        <Link href="/community" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.65rem", color: "var(--orange)", textDecoration: "none" }}>
          <Users size={11} />
          Community
        </Link>
      </div>

      {/* Question */}
      <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--t1)", marginBottom: 12, lineHeight: 1.4 }}>
        {poll.question}
      </p>

      {/* Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {poll.options.map(opt => {
          const isSelected = poll.user_vote === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => !voteMut.isPending && !voted && voteMut.mutate({ pollId: poll.id, optionId: opt.id })}
              style={{
                position: "relative", overflow: "hidden",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "7px 12px", borderRadius: "var(--r-sm)", border: "1px solid",
                cursor: voted ? "default" : "pointer", textAlign: "left",
                background: isSelected ? "var(--orange-dim)" : "var(--bg-hover)",
                borderColor: isSelected ? "var(--orange-border)" : "var(--border)",
                transition: "all 0.15s",
              }}
            >
              {voted && (
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${opt.pct}%`, background: isSelected ? "rgba(122,167,232,0.14)" : "rgba(255,255,255,0.03)", transition: "width 0.5s" }} />
              )}
              <span style={{ position: "relative", fontSize: "0.75rem", color: isSelected ? "var(--orange)" : "var(--t1)", fontWeight: isSelected ? 600 : 400 }}>
                {isSelected && "✓ "}{opt.text}
              </span>
              {voted && (
                <span style={{ position: "relative", fontSize: "0.68rem", fontWeight: 600, color: isSelected ? "var(--orange)" : "var(--t3)", flexShrink: 0, marginLeft: 8 }}>
                  {opt.pct.toFixed(0)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 8, fontSize: "0.6rem", color: "var(--t3)" }}>
        {poll.total_votes} vote{poll.total_votes !== 1 ? "s" : ""}
        {!voted && <span style={{ marginLeft: 6, color: "var(--orange)" }}>· Click to vote</span>}
        {data.polls.length > 1 && (
          <Link href="/community?tab=polls" style={{ marginLeft: 8, color: "var(--orange)", textDecoration: "none" }}>
            +{data.polls.length - 1} more poll{data.polls.length > 2 ? "s" : ""}
          </Link>
        )}
      </div>
    </section>
  );
}
