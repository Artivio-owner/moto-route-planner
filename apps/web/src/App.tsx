import { lazy, Suspense } from "react";
import { Layout } from "./components/Layout";
import { LandingPage } from "./pages/LandingPage";
import { usePathname } from "./router";

const PlannerPage = lazy(() =>
  import("./pages/PlannerPage").then((m) => ({ default: m.PlannerPage })),
);
const LegalPage = lazy(() => import("./pages/LegalPage").then((m) => ({ default: m.LegalPage })));

export function App() {
  const path = usePathname();
  let page;
  if (path.startsWith("/plan")) page = <PlannerPage />;
  else if (path === "/privacy") page = <LegalPage kind="privacy" />;
  else if (path === "/disclaimer") page = <LegalPage kind="disclaimer" />;
  else page = <LandingPage />;
  return (
    <Layout>
      <Suspense fallback={<p className="page">Загружаем…</p>}>{page}</Suspense>
    </Layout>
  );
}
