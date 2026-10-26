// Лендинг: тексты из docs/13-landing-copy.md. Публикуем только то, что уже работает (v0.1).
import { site } from "../config";
import { Link } from "../router";

const faq: [string, string][] = [
  ["Это бесплатно?", "Да. Проект некоммерческий и открытый."],
  ["Нужна ли регистрация?", "Нет."],
  ["Можно ли открыть маршрут в навигаторе?", "Да, через файл GPX."],
  [
    "Насколько точны расчёты?",
    "Расчёты ориентировочные: цены по умолчанию вы можете изменить, а состояние дорог и погода меняются. Проверяйте маршрут перед выездом.",
  ],
  [
    "В каких странах работает?",
    "На старте Россия. Казахстан, Грузию и Турцию добавим следующими, потом Европу.",
  ],
  [
    "Как маршрут делится на дни?",
    "Вы выбираете: по километрам или вручную, от города до города. Деление по времени в пути и по числу дней появится позже.",
  ],
  [
    "Можно ли ехать вдвоём на двух мотоциклах?",
    "Да: укажите людей и число мотоциклов, топливо посчитается на каждый.",
  ],
  ["Работает ли на телефоне?", "Да, сайт адаптивный, его можно установить как приложение."],
  ["Код открыт?", `Да, MIT, он лежит на GitHub: ${site.github}`],
  [
    "Нашли ошибку в маршруте или данных?",
    `Напишите на ${site.email} или создайте Issue на GitHub.`,
  ],
];

export function LandingPage() {
  return (
    <main>
      <section className="page" style={{ paddingTop: 48 }}>
        <h1 style={{ fontSize: 36 }}>Рассчитайте мотопоездку целиком: маршрут, бензин и ночлег</h1>
        <p style={{ fontSize: 18 }}>
          Укажите, откуда и куда, сколько вас и на чём едете. «Верста» разобьёт путь на дни,
          посчитает заправки и расходы на топливо и соберёт путевой лист в PDF.
        </p>
        <div className="actions">
          <Link
            to="/plan"
            className="btn"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            Построить маршрут
          </Link>
          <Link
            to="/#how"
            className="btn ghost"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            Как это работает
          </Link>
        </div>
        <p className="hint">Бесплатно. Без регистрации. Открытый код.</p>
      </section>

      <section className="page">
        <h2>Сколько вкладок нужно, чтобы спланировать поездку?</h2>
        <p>
          Карта для маршрута, калькулятор бензина, таблица расходов, поиск ночлега. Каждый раз всё
          считаете вручную и сводите в один файл. «Верста» собирает расчёты в одном месте и выдаёт
          готовый путевой лист.
        </p>
      </section>

      <section className="page" id="how">
        <h2>Как это работает</h2>
        <ol>
          <li>
            <strong>Задайте поездку.</strong> Откуда, куда, через какие города, дата старта, сколько
            человек, какой у вас мотоцикл.
          </li>
          <li>
            <strong>Решите, как делить на дни.</strong> По километрам или сами выберите, где
            ночевать.
          </li>
          <li>
            <strong>Скачайте путевой лист.</strong> PDF с картой, днями и заправками, GPX для
            навигатора и ссылка, чтобы поделиться.
          </li>
        </ol>
      </section>

      <section className="page">
        <h2>Всё, что обычно считают вручную</h2>
        <ul>
          <li>
            <strong>Маршрут для мотоцикла.</strong> Можно избегать грунтовых дорог. Точки
            перетаскиваются.
          </li>
          <li>
            <strong>Дни и ночёвки.</strong> Делите по километрам или от города до города.
          </li>
          <li>
            <strong>Топливо и заправки.</strong> По вашему расходу и объёму бака: сколько литров,
            когда заправляться, во сколько это обойдётся. Рубли и доллары.
          </li>
          <li>
            <strong>Местное время.</strong> Старт и финиш каждого дня по часовому поясу места.
          </li>
          <li>
            <strong>Путевой лист в PDF.</strong> Сводка, карта и таблица по дням.
          </li>
        </ul>
      </section>

      <section className="page">
        <h2>Ваши маршруты остаются у вас</h2>
        <p>
          Регистрации нет. История последних маршрутов хранится в вашем браузере 30 дней, на нашем
          сервере маршруты не сохраняются. Поделиться можно ссылкой: маршрут записан в самом адресе.
        </p>
        <p className="hint">
          Карты: © участники OpenStreetMap. Код проекта открыт по лицензии MIT.
        </p>
      </section>

      <section className="page" id="faq">
        <h2>Вопросы и ответы</h2>
        {faq.map(([q, a]) => (
          <details key={q} className="card" style={{ marginBottom: 8 }}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>

      <section className="page">
        <h2>Рассчитайте свою поездку</h2>
        <p>Начните с двух точек на карте.</p>
        <Link
          to="/plan"
          className="btn"
          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          Построить маршрут
        </Link>
      </section>
      <script
        type="application/ld+json"
        // Микроразметка FAQPage и WebApplication (K-03).
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebApplication",
                name: "Верста",
                applicationCategory: "TravelApplication",
                operatingSystem: "Web",
                inLanguage: "ru",
                offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" },
              },
              {
                "@type": "FAQPage",
                mainEntity: faq.map(([q, a]) => ({
                  "@type": "Question",
                  name: q,
                  acceptedAnswer: { "@type": "Answer", text: a },
                })),
              },
            ],
          }),
        }}
      />
    </main>
  );
}
