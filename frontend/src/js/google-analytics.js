/*
 *  google-analytics.js -- exports a function that will insert
 *   	the google analytics snippets.
 */

const GOOGLE_ANALYTICS_ACCOUNT_ID = "UA-85621398-1";

export default function load_ga_object() {
	(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
	(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
	m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
	})(window,document,'script','https://www.google-analytics.com/analytics.js','ga');

	const ga = window["ga"];

	// Creates a default tracker with automatic cookie domain configuration.
	ga('create', GOOGLE_ANALYTICS_ACCOUNT_ID, 'auto');

	// Sends a pageview hit from the tracker just created.
	ga('send', 'pageview');

	return ga
}


/* ---------------------------------------------------------------------
 *        Google Tag Manager:  Analytics for Google ADs
 */

const GOOGLE_TAG_MANAGER_ID = "AW-848012525";

// (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
// new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
// j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
// 'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
// })(window,document,'script','dataLayer','GTM-XXXX');

// Not sure how to use these yet

/* Global site tag (gtag.js) - Google Ads: 848012525 */
/*
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-848012525"></script>
*/

window.dataLayer = window.dataLayer || [];
function gtag() {
	dataLayer.push(arguments);
}
gtag('js', new Date());
gtag('config', 'AW-848012525');


/*  call gtag_report_conversion
 *    when someone clicks on the chosen link or button.
 */
export function gtag_report_conversion(url) {
  var callback = function () {
    if (typeof(url) != 'undefined') {
      window.location = url;
    }
  };
  gtag('event', 'conversion', {
      'send_to': 'AW-848012525/OWNiCNWMgdABEO3JrpQD',
      'event_callback': callback
  });
  return false;
}
