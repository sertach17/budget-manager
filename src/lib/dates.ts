// Today's date in Eastern time (where Sergio lives), as YYYY-MM-DD.
export function easternToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}
