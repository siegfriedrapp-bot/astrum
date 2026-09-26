import { createFileRoute } from "@tanstack/react-router";
import { AstrumApp } from "@/game/AstrumApp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <AstrumApp />;
}
