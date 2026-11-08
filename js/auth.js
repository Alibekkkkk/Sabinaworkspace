export async function isTeacher(user, database) {
  if (!user || !database || typeof user.uid !== "string" || !user.uid) return false;
  const snapshot = await database.ref(`admins/${user.uid}`).once("value");
  return snapshot.val() === true;
}
