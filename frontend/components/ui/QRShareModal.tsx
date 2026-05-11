"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X, Copy, Download, Twitter } from "lucide-react";

interface QRShareModalProps {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
  subtitle?: string;
}

export default function QRShareModal({ open, onClose, url, title, subtitle }: QRShareModalProps) {
  const [copied, setCopied] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: no-op
    }
  };

  const handleDownload = () => {
    const svg = svgRef.current;
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const SIZE = 512;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      URL.revokeObjectURL(blobUrl);
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `capitalis-qr-${title.toLowerCase().replace(/\s+/g, "-")}.png`;
      a.click();
    };
    img.src = blobUrl;
  };

  const handleTwitter = () => {
    const text = encodeURIComponent(`${title} via @CapitalisApp`);
    const shareUrl = encodeURIComponent(url);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${shareUrl}`, "_blank", "noopener,noreferrer");
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`${title}\n${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative",
          background: "var(--bg-card)",
          border: "1px solid var(--card-border)",
          borderRadius: "var(--r-xl)",
          padding: "28px 24px 24px",
          width: "100%",
          maxWidth: 400,
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 14, right: 14,
            background: "none", border: "none", cursor: "pointer",
            color: "var(--t3)", padding: 4, display: "flex", alignItems: "center",
            borderRadius: "var(--r-md)",
          }}
        >
          <X size={16} />
        </button>

        {/* Title */}
        <p style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>
          Share
        </p>
        <h2 style={{
          fontFamily: "Manrope, DM Sans, sans-serif",
          fontSize: "1rem", fontWeight: 700,
          color: "var(--t1)", letterSpacing: "-0.01em",
          marginBottom: subtitle ? 6 : 20,
        }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ fontSize: "0.72rem", color: "var(--t3)", marginBottom: 20, lineHeight: 1.5 }}>
            {subtitle}
          </p>
        )}

        {/* QR code */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16, background: "#ffffff",
          borderRadius: "var(--r-md)", border: "1px solid var(--card-border)",
          marginBottom: 20,
        }}>
          <QRCodeSVG
            ref={svgRef}
            value={url}
            size={200}
            fgColor="#1a1a1a"
            bgColor="#ffffff"
            level="M"
            includeMargin={false}
          />
        </div>

        {/* URL display */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px",
          background: "var(--bg-inner)", border: "1px solid var(--card-border)",
          borderRadius: "var(--r-md)", marginBottom: 16,
        }}>
          <span style={{
            flex: 1, fontSize: "0.68rem", color: "var(--t2)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {url}
          </span>
          <button
            onClick={handleCopy}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 10px", borderRadius: "var(--r-md)",
              border: "1px solid",
              background: copied ? "var(--orange-dim)" : "transparent",
              borderColor: copied ? "var(--orange-border)" : "var(--card-border)",
              color: copied ? "var(--orange)" : "var(--t2)",
              cursor: "pointer", fontSize: "0.65rem", fontWeight: 600,
              transition: "all 0.15s", flexShrink: 0,
            }}
          >
            <Copy size={11} />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        {/* Action row */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleDownload}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "8px 0", borderRadius: "var(--r-md)",
              border: "1px solid var(--card-border)", background: "transparent",
              color: "var(--t2)", cursor: "pointer", fontSize: "0.72rem", fontWeight: 600,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--orange-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--orange)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--card-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--t2)"; }}
          >
            <Download size={13} />
            Download PNG
          </button>
          <button
            onClick={handleTwitter}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "8px 14px", borderRadius: "var(--r-md)",
              border: "1px solid var(--card-border)", background: "transparent",
              color: "var(--t2)", cursor: "pointer", fontSize: "0.72rem", fontWeight: 600,
              transition: "all 0.15s", flexShrink: 0,
            }}
            title="Share on X (Twitter)"
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--orange-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--orange)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--card-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--t2)"; }}
          >
            <Twitter size={13} />
          </button>
          <button
            onClick={handleWhatsApp}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "8px 14px", borderRadius: "var(--r-md)",
              border: "1px solid var(--card-border)", background: "transparent",
              color: "var(--t2)", cursor: "pointer", fontSize: "0.72rem",
              transition: "all 0.15s", flexShrink: 0,
            }}
            title="Share on WhatsApp"
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--orange-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--orange)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--card-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--t2)"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
