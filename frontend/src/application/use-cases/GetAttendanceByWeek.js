export class GetAttendanceByWeek {
  constructor(attendanceRepository) {
    this.attendanceRepository = attendanceRepository;
  }

  async execute(anio, semana) {
    return await this.attendanceRepository.getAttendanceByWeek(anio, semana);
  }
}
