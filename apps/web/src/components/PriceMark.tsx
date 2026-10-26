/** Метка «ориентировочно» или «изменено вами» (спецификация 14, раздел 6). */
export function PriceMark({ edited, onReset }: { edited: boolean; onReset(): void }) {
  if (!edited) return <span className="mark">ориентировочно</span>;
  return (
    <span className="row" style={{ gap: 6, marginTop: 4 }}>
      <span className="mark edited">изменено вами</span>
      <button type="button" className="link-btn" onClick={onReset}>
        сбросить
      </button>
    </span>
  );
}
