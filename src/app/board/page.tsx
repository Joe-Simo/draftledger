import type { Metadata } from "next";
import { BoardClient } from "./BoardClient";

export const metadata: Metadata = { title: "Series board | DraftLedger" };

export default function BoardPage() {
  return <BoardClient />;
}
