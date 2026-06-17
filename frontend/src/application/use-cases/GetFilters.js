export class GetFilters {
  constructor(attendanceRepository) {
    this.attendanceRepository = attendanceRepository;
  }

  async execute() {
    return await this.attendanceRepository.getFilters();
  }
}
