import { createI18n } from 'vue-i18n'

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en: {
      home: 'Home',
      languageControl: 'Interface language',
      author: 'Author area',
      title: 'TestBraid',
      status: 'Foundation preview',
      note: 'Test editing, login, upload, and learner evaluation are not implemented yet.',
      api: 'API health',
      connected: 'Connected',
      unavailable: 'Not available',
      adminPlaceholder: 'This is a placeholder. Author login and editing are upcoming PoC-A/PoC-B tasks.',
      learnerPlaceholder: 'The test player is not implemented yet.',
      learnerTest: 'Test ID: {id}',
    },
    cs: {
      home: 'Úvod',
      languageControl: 'Jazyk rozhraní',
      author: 'Administrace',
      title: 'TestBraid',
      status: 'Základ projektu',
      note: 'Editace testů, přihlášení, nahrávání a vyhodnocování zatím nejsou implementovány.',
      api: 'Stav API',
      connected: 'Připojeno',
      unavailable: 'Nedostupné',
      adminPlaceholder: 'Zatím jen zástupná stránka. Přihlášení a editor přijdou v dalších krocích PoC.',
      learnerPlaceholder: 'Prohlížeč testů zatím není implementován.',
      learnerTest: 'ID testu: {id}',
    },
  },
})
