"use client";

import { useState } from "react";

export function ShareStoreButton() {
  const [status, setStatus] = useState("");

  async function share() {
    const shareData = { title: document.title, url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setStatus("Montra partilhada.");
        return;
      }
      await navigator.clipboard.writeText(shareData.url);
      setStatus("Ligação copiada.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("Não foi possível partilhar. Copia a ligação da barra do navegador.");
    }
  }

  return <span className="store-share-control"><button className="button button-secondary" type="button" onClick={() => void share()}>Partilhar loja <span aria-hidden="true">↗</span></button><span className="sr-only" role="status" aria-live="polite">{status}</span></span>;
}