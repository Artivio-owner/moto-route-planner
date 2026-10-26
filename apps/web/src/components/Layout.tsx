import type { ReactNode } from "react";
import { site } from "../config";
import { Link } from "../router";

export function Header() {
  return (
    <header className="header">
      <Link to="/" className="logo">
        <img src="/icon.svg" alt="" />
        Верста
      </Link>
      <nav aria-label="Основное меню">
        <Link to="/plan">Построить маршрут</Link>
        <Link to="/#how">Как это работает</Link>
        <Link to="/#faq">Вопросы</Link>
        <a href={site.github} rel="noopener">
          GitHub
        </a>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <p>
        © Верста, 2026 · Код MIT · Карты © участники{" "}
        <a href="https://www.openstreetmap.org/copyright" rel="noopener">
          OpenStreetMap
        </a>
      </p>
      <p>
        <a href={site.github} rel="noopener">
          GitHub
        </a>{" "}
        · <Link to="/privacy">Политика конфиденциальности</Link> ·{" "}
        <Link to="/disclaimer">Отказ от ответственности</Link> · Контакты:{" "}
        <a href={`mailto:${site.email}`}>{site.email}</a> ·{" "}
        <a href={site.issues} rel="noopener">
          Сообщить об ошибке
        </a>
      </p>
      <p>
        Расчёты ориентировочные. За безопасность поездки и наличие нужных документов отвечает
        водитель.
      </p>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      {children}
      <Footer />
    </>
  );
}
