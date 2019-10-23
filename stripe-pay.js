(function() {
  var stripe = Stripe('pk_test_g07YMP7zamLzkz48YY608ZiI');

  var checkoutButton = document.getElementById('checkout-button-plan_G1pEJXB56hrJ1N');
  checkoutButton.addEventListener('click', function () {
    // When the customer clicks on the button, redirect
    // them to Checkout.
    stripe.redirectToCheckout({
      items: [{plan: 'plan_G1pEJXB56hrJ1N', quantity: 1}],

      // Do not rely on the redirect to the successUrl for fulfilling
      // purchases, customers may not always reach the success_url after
      // a successful payment.
      // Instead use one of the strategies described in
      // https://stripe.com/docs/payments/checkout/fulfillment
      successUrl: 'https://github.com/ebrensi/success',
      cancelUrl: 'https://github.com/ebrensi/canceled',
      // submitType: 'donate'
    })
    .then(function (result) {
      if (result.error) {
        // If `redirectToCheckout` fails due to a browser or network
        // error, display the localized error message to your customer.
        var displayError = document.getElementById('error-message');
        displayError.textContent = result.error.message;
      }
    });
  });
})();