// Простейший маршрутизатор по pathname: страниц мало, отдельная библиотека не нужна.
import { useEffect, useState, type AnchorHTMLAttributes } from "react";

const listeners = new Set<() => void>();

export function navigate(to: string): void {
  window.history.pushState(null, "", to);
  listeners.forEach((l) => l());
  const hash = to.split("#")[1];
  if (hash) document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
  else window.scrollTo(0, 0);
}

export function usePathname(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    listeners.add(update);
    window.addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return path;
}

export function Link({ to, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={to}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    />
  );
}
