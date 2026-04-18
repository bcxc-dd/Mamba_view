import HomeParallaxPage from "./pages/HomeParallaxPage";
import LegacyAppPage from "./pages/LegacyAppPage";

function NotFoundPage() {
  return (
    <main style={{ padding: "40px 20px", textAlign: "center" }}>
      <h1 style={{ marginBottom: 8 }}>404</h1>
      <p style={{ marginBottom: 16 }}>页面不存在</p>
      <a href="/">返回首页</a>
    </main>
  );
}

function App() {
  const pathname = window.location.pathname.replace(/\/$/, "") || "/";

  if (pathname === "/") {
    return <HomeParallaxPage />;
  }

  if (pathname === "/legacy") {
    return <LegacyAppPage />;
  }

  return <NotFoundPage />;
}

export default App;
