import { db } from "./db.js";

export async function generateIncidentNo(conn=db) {
  const [[{cnt}]]=await conn.query("SELECT COUNT(*) AS cnt FROM incidents");
  return `INC-${String(Number(cnt||0)+1).padStart(6,"0")}`;
}
