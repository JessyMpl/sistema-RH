import { apiUrl } from '@/utils/api';
import { AttendanceRecord } from '@/domain/models/AttendanceRecord';
import { CalendarDay } from '@/domain/models/CalendarDay';

export class AttendanceRepositoryImpl {
  async getFilters() {
    const token = localStorage.getItem('token');
    const response = await fetch(apiUrl('/api/v1/attendance/filtros-disponibles'), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Error al obtener los filtros disponibles');
    }
    
    const data = await response.json();
    return data.filtros; // Retorna un objeto { "2025": [1, 2, ...], "2026": [1, 2, ...] }
  }

  async getAttendanceByWeek(anio, semana) {
    const token = localStorage.getItem('token');
    const response = await fetch(apiUrl(`/api/v1/attendance/registros?anio=${anio}&semana=${semana}`), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Error al obtener los registros de asistencia');
    }

    const data = await response.json();
    
    return {
      dias: data.dias.map(d => new CalendarDay(d)),
      registros: data.registros.map(r => new AttendanceRecord(r))
    };
  }
}
