// Codes d'intégration Bizouk par édition, fournis par l'organisation (tels quels).
// Le composant <BizoukWidget> n'injecte que l'<iframe> ; le script tiers
// widget_client.js est chargé une seule fois par page via next/script.

export const BIZOUK_WIDGET_SRC =
  'https://static.bizouk.com/lib/js/widget/widget_client.js';

export const bizoukEmbeds: Record<string, string> = {
  'before-christmas':
    '<iframe style="background-color: transparent;" src="https://www.bizouk.com/stores/reservation/place?event=111794&widget=1" name="payment-frame" width="100%" height="1065" frameborder="0" scrolling="yes"></iframe>\n<script type="text/javascript" src="https://static.bizouk.com/lib/js/widget/widget_client.js"></script>',

  'edition-picasso':
    '<iframe style="background-color: transparent;" src="https://www.bizouk.com/stores/reservation/place?event=121434&widget=1" name="payment-frame" width="100%" height="1065" frameborder="0" scrolling="yes"></iframe>\n<script type="text/javascript" src="https://static.bizouk.com/lib/js/widget/widget_client.js"></script>',

  'candy-land':
    '<iframe style="background-color: transparent;" src="https://www.bizouk.com/stores/reservation/place?event=125726&widget=1" name="payment-frame" width="100%" height="1065" frameborder="0" scrolling="yes"></iframe>\n<script type="text/javascript" src="https://static.bizouk.com/lib/js/widget/widget_client.js"></script>',

  'welcome-to-dominica':
    '<iframe style="background-color: transparent;" src="https://www.bizouk.com/stores/reservation/place?event=127255&widget=1" name="payment-frame" width="100%" height="1065" frameborder="0" scrolling="yes"></iframe>\n<script type="text/javascript" src="https://static.bizouk.com/lib/js/widget/widget_client.js"></script>',

  'la-nuit-des-ombres':
    '<iframe style="background-color: transparent;" src="https://www.bizouk.com/stores/reservation/place?event=128267&widget=1" name="payment-frame" width="100%" height="1065" frameborder="0" scrolling="yes"></iframe>\n<script type="text/javascript" src="https://static.bizouk.com/lib/js/widget/widget_client.js"></script>',

  'la-xploz-tropical-island':
    '<iframe style="background-color: transparent;" src="https://www.bizouk.com/stores/reservation/place?event=116817&widget=1" name="payment-frame" width="100%" height="1065" frameborder="0" scrolling="yes"></iframe>\n<script type="text/javascript" src="https://static.bizouk.com/lib/js/widget/widget_client.js"></script>',
};

export function getBizoukEmbed(slug: string): string | undefined {
  return bizoukEmbeds[slug];
}
