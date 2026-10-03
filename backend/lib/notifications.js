import { db } from "./db.js";

export async function addNotification({userId=null,bookingId=null,type,title,message,channel="in_app",status="sent"}) {
  await db.query(
    "INSERT INTO notifications(user_id,booking_id,channel,type,title,message,status) VALUES(?,?,?,?,?,?,?)",
    [userId,bookingId,channel,type,title,message,status]
  );
}
