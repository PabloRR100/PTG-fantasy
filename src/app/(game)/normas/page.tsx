import { formatMoney } from "@/lib/format";

export const metadata = { title: "Normas de juego · Padel Fantasy" };

// Every rule here is what the pilot really does (supabase/migrations, src/services), not what docs/GAMEPLAY.md
// proposes: the daily value change and any per-level factor are NOT built, so they are not promised.
const START_BUDGET = 5_000_000;

export default function NormasPage() {
  return (
    <>
      <h1>Normas de juego</h1>
      <p className="lead">
        Padel Fantasy usa jugadores y partidos reales de la liga de Madrid (masculino y femenino, de Blanco a Naranja). Estas son las reglas
        que aplica el piloto ahora mismo.
      </p>

      <section className="rules">
        <h2>Tu equipo</h2>
        <ul>
          <li>Empiezas con <strong>{formatMoney(START_BUDGET)}</strong> y una plantilla de <strong>27 jugadores al azar</strong>: 3 de cada uno de los 9 niveles (Azul y Blanco cuentan como un solo nivel; después vienen Verde, Rosa, Oro, Granate, Morado, Marrón, Plata y Naranja).</li>
          <li>Un jugador solo puede estar en un equipo a la vez.</li>
          <li>Tu alineación son <strong>18 titulares: 2 de cada nivel</strong>. Puedes cambiarla cuando quieras.</li>
          <li>Puntúa la alineación que tengas a las <strong>06:00 (hora de Madrid)</strong>, durante las 24 horas siguientes. Un cambio que hagas hoy empieza a puntuar desde el siguiente cierre de las 06:00.</li>
        </ul>

        <h2>Puntos por partido</h2>
        <p>Cada titular puntúa por cada partido real que juega en la liga:</p>
        <table>
          <thead><tr><th>Qué pasa</th><th className="num">Puntos</th></tr></thead>
          <tbody>
            <tr><td>Jugar el partido</td><td className="num">+2</td></tr>
            <tr><td>Ganar el partido</td><td className="num">+4</td></tr>
            <tr><td>Cada set ganado</td><td className="num">+1</td></tr>
            <tr><td>Cada set perdido</td><td className="num">−1</td></tr>
          </tbody>
        </table>
        <ul>
          <li>Un partido nunca da menos de 0. Ganar 6-3 6-4 da 8; perder 3-6 4-6 da 0.</li>
          <li>Los dos de una pareja suman lo mismo.</li>
          <li>Un partido sin jugar (walkover) da 0 y no cuenta como jugado.</li>
          <li>Cada partido cuenta para el día (de 06:00 a 06:00) en el que empezó.</li>
          <li>Los jugadores de banquillo no puntúan.</li>
          <li>Durante el piloto los resultados se importan de la liga a mano, así que pueden tardar en aparecer.</li>
        </ul>

        <h2>Mercado y pujas</h2>
        <ul>
          <li>Cada día se abren subastas de jugadores libres (nadie los tiene): 3 al azar de cada nivel.</li>
          <li>La puja mínima es el <strong>valor del jugador</strong>, y una puja no puede superar tu presupuesto disponible.</li>
          <li>Puedes pujar por varios jugadores y subir una puja que ya hiciste. Hasta el cierre no se cobra nada.</li>
          <li>A las <strong>06:00 (hora de Madrid)</strong> se resuelven las subastas: gana la <strong>puja más alta</strong>; si hay empate, la que se hizo <strong>antes</strong>.</li>
          <li>El ganador paga <strong>su puja</strong>. Si en ese momento ya no tiene dinero suficiente, el jugador pasa a la siguiente puja más alta; si nadie puede pagar, vuelve a quedar libre.</li>
          <li>Las subastas se resuelven una a una en un orden interno. Si pujas por más jugadores de los que puedes pagar, no puedes elegir cuál se paga primero.</li>
          <li>Ese mismo cierre guarda las alineaciones del día y abre las subastas nuevas. Durante el piloto, el administrador puede adelantar el cierre para hacer pruebas.</li>
        </ul>

        <h2>Vender</h2>
        <ul>
          <li>Puedes vender un jugador al mercado al instante: te pagan su valor actual.</li>
          <li>Debes conservar <strong>al menos 2 jugadores de cada nivel</strong>.</li>
          <li>Si vendes a un titular, entra en su lugar el suplente de más valor de ese nivel.</li>
        </ul>

        <h2>Cláusulas</h2>
        <ul>
          <li>Puedes llevarte a un jugador de otro equipo pagando su <strong>cláusula: el doble de su valor de mercado</strong>. Lo haces desde Jugadores, o pulsando un equipo en Clasificación o en Jornada.</li>
          <li>El pago es inmediato y el dinero va al equipo que lo tenía. Necesitas saldo suficiente.</li>
          <li>Ese equipo debe conservar <strong>al menos 2 jugadores de cada nivel</strong>: si no, no se puede.</li>
          <li>Si era titular, entra en su lugar su suplente de más valor de ese nivel. El jugador llega a tu banquillo.</li>
          <li>Puedes <strong>blindar</strong> a tus jugadores desde Equipo: subir su cláusula hasta el cuádruple de su valor, en pasos de 10.000 €. Subirla bloquea la mitad del aumento de tu presupuesto y bajarla te devuelve esa mitad; cuando un rival paga, el dinero íntegro es para ti y lo bloqueado se pierde con el jugador. Un jugador que llega a un equipo (puja o cláusula) empieza con la cláusula base.</li>
          <li>Se avisa al equipo que pierde al jugador, y la operación aparece en el Tablón.</li>
        </ul>

        <h2>Valor de los jugadores</h2>
        <ul>
          <li>El valor sale de los datos de la liga cuando se importa el jugador: una base por nivel (Blanco la más alta, Naranja la más baja), ajustada por su porcentaje de victorias y por cuánto juega.</li>
          <li>En el piloto <strong>el valor no cambia</strong> con el tiempo ni con las pujas.</li>
        </ul>

        <h2>Clasificación</h2>
        <ul>
          <li>Suma los puntos de tus titulares guardados a las 06:00 de cada día.</li>
          <li>Se muestra la semana en curso (de lunes a domingo) y el total.</li>
          <li>Con el mismo total, los equipos comparten posición.</li>
        </ul>

        <h2>Todavía no existe</h2>
        <ul>
          <li>Cambio diario del valor según la forma del jugador.</li>
          <li>Ajuste de puntos por nivel: un punto vale lo mismo en Blanco que en Naranja; el equilibrio sale de elegir 2 de cada nivel.</li>
        </ul>
      </section>
    </>
  );
}
