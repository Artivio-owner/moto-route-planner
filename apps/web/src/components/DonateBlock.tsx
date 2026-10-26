import { useEffect, useState } from "react";
import { donate, donateEnabled, donateQrSrc } from "../lib/donate";

/** «Поддержать разработчика»: кнопка-ссылка и QR-код. Без ссылки в data/site.json не показывается. */
export function DonateBlock({ compact = false }: { compact?: boolean }) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!donateEnabled) return;
    void donateQrSrc().then(setQr);
  }, []);

  if (!donateEnabled) return null;
  return (
    <aside className={`donate${compact ? " compact" : ""}`} aria-label={donate.label}>
      <div>
        {!compact && <h2>{donate.label}</h2>}
        <p>
          «Верста» бесплатная и без рекламы. Если сервис помог спланировать поездку, можно
          поддержать разработчика.
        </p>
        <a className="btn accent" href={donate.url} target="_blank" rel="noopener">
          {donate.label}
        </a>
      </div>
      {qr && (
        <img
          className="donate-qr"
          src={qr}
          alt={`QR-код: ${donate.label}`}
          width={120}
          height={120}
        />
      )}
    </aside>
  );
}
