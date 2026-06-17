export class CalendarDay {
  constructor({ id, fecha, anio, mes, dia, semana, diaSemana, quincena, esLaboral }) {
    this.id = id;
    this.fecha = new Date(fecha);
    this.anio = anio;
    this.mes = mes;
    this.dia = dia;
    this.semana = semana;
    this.diaSemana = diaSemana;
    this.quincena = quincena;
    this.esLaboral = esLaboral;
  }
}
