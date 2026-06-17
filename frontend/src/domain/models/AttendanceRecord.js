export class AttendanceRecord {
  constructor({ id, employeeId, timestamp, serialNumber, cardNumber, source, clockIp, clockName, syncDate, createdAt }) {
    this.id = id;
    this.employeeId = employeeId;
    this.timestamp = new Date(timestamp);
    this.serialNumber = serialNumber;
    this.cardNumber = cardNumber || '';
    this.source = source;
    this.clockIp = clockIp || '';
    this.clockName = clockName || '';
    this.syncDate = new Date(syncDate);
    this.createdAt = new Date(createdAt);
  }
}
