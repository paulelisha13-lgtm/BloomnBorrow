import { db } from "./db.js";

export async function addNotification({userId=null,bookingId=null,type,title,message,channel="in_app"}) {
  await db.query(
    "INSERT INTO notifications(user_id,booking_id,channel,type,title,message,status) VALUES(?,?,?,?,?,?,'sent')",
    [userId,bookingId,channel,type,title,message]
  );
}
