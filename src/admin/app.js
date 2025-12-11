const config = {
  locales: [
    'vi',
    'en'
  ],
  translations: {
    en: {
      "app.components.LeftMenu.navbrand.title": "MoonStore Dashboard",
      "app.components.LeftMenu.navbrand.workplace": "develop",
      "Auth.form.welcome.title": "Welcome to MoonShop Admin",
      "Auth.form.welcome.subtitle": "Log in to your Moon account",
      "Auth.form.email.placeholder": "e.g. moon@gmail.com",
    },
    vi: {
      "app.components.LeftMenu.navbrand.title": "MoonStore Dashboard",
      "app.components.LeftMenu.navbrand.workplace": "develop",
      "Auth.form.welcome.title": "Welcome to MoonShop Admin",
      "Auth.form.welcome.subtitle": "Log in to your Moon account",
      "Auth.form.email.placeholder": "e.g. moon@gmail.com",
    }
  }
};

const bootstrap = (app) => {
  console.log(app);
};

export default {
  config,
  bootstrap
};
