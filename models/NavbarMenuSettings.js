import mongoose from 'mongoose';

const NavbarMenuSettingsSchema = new mongoose.Schema(
  {
    storeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    logoUrl: {
      type: String,
      default: '',
      trim: true,
    },
    logoWidth: {
      type: Number,
    },
    logoHeight: {
      type: Number,
    },
    footerLogoSameAsNavbar: {
      type: Boolean,
      default: true,
    },
    footerLogoUrl: {
      type: String,
      default: '',
      trim: true,
    },
    footerLogoWidth: {
      type: Number,
      default: 160,
    },
    footerLogoHeight: {
      type: Number,
      default: 40,
    },
    backgroundColor: {
      type: String,
      default: '#8f3404',
      trim: true,
    },
    navMenuEnabled: {
      type: Boolean,
      default: true,
    },
    navMenuUseParentCategories: {
      type: Boolean,
      default: false,
    },
    navActionsVisibility: {
      store: { type: Boolean, default: true },
      orders: { type: Boolean, default: true },
      wishlist: { type: Boolean, default: true },
      cart: { type: Boolean, default: true },
    },
    navMenuStyle: {
      barBackgroundColor: { type: String, default: '#ffffff', trim: true },
      barTextColor: { type: String, default: '#334155', trim: true },
      barHoverBackgroundColor: { type: String, default: '#f1f5f9', trim: true },
      dropdownBackgroundColor: { type: String, default: '#ffffff', trim: true },
      dropdownTextColor: { type: String, default: '#334155', trim: true },
      dropdownMutedTextColor: { type: String, default: '#64748b', trim: true },
      dropdownBorderColor: { type: String, default: '#e2e8f0', trim: true },
    },
    navMenuItems: [
      {
        name: { type: String, default: '' },
        link: { type: String, default: '' },
        icon: { type: String, default: '' },
        hasDropdown: { type: Boolean, default: false },
        categoryId: { type: String, default: '' },
        megaMenu: {
          linkColumns: { type: Number, default: 1 },
          links: [
            {
              name: { type: String, default: '' },
              link: { type: String, default: '' },
            },
          ],
          images: [
            {
              url: { type: String, default: '' },
              label: { type: String, default: '' },
              link: { type: String, default: '' },
            },
          ],
        },
      },
    ],
    items: [
      {
        label: {
          type: String,
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
        categoryId: {
          type: String,
          required: false,
        },
      },
    ],
  },
  { timestamps: true }
);

const NavbarMenuSettingsModel = mongoose.models.NavbarMenuSettings ||
  mongoose.model('NavbarMenuSettings', NavbarMenuSettingsSchema);

// In Next.js dev hot-reload, a cached model may have been compiled before
// new fields were added. Ensure required paths exist on the cached schema.
if (!NavbarMenuSettingsModel.schema.path('logoWidth')) {
  NavbarMenuSettingsModel.schema.add({
    logoWidth: {
      type: Number,
    },
  });
}

if (!NavbarMenuSettingsModel.schema.path('logoHeight')) {
  NavbarMenuSettingsModel.schema.add({
    logoHeight: {
      type: Number,
    },
  });
}

if (!NavbarMenuSettingsModel.schema.path('navMenuEnabled')) {
  NavbarMenuSettingsModel.schema.add({
    navMenuEnabled: {
      type: Boolean,
      default: true,
    },
  });
}

if (!NavbarMenuSettingsModel.schema.path('navActionsVisibility')) {
  NavbarMenuSettingsModel.schema.add({
    navActionsVisibility: {
      store: { type: Boolean, default: true },
      orders: { type: Boolean, default: true },
      wishlist: { type: Boolean, default: true },
      cart: { type: Boolean, default: true },
    },
  });
}

if (!NavbarMenuSettingsModel.schema.path('navMenuItems')) {
  NavbarMenuSettingsModel.schema.add({
    navMenuItems: [
      {
        name: { type: String, default: '' },
        link: { type: String, default: '' },
        icon: { type: String, default: '' },
        hasDropdown: { type: Boolean, default: false },
        categoryId: { type: String, default: '' },
        megaMenu: {
          linkColumns: { type: Number, default: 1 },
          links: [
            {
              name: { type: String, default: '' },
              link: { type: String, default: '' },
            },
          ],
          images: [
            {
              url: { type: String, default: '' },
              label: { type: String, default: '' },
              link: { type: String, default: '' },
            },
          ],
        },
      },
    ],
  });
}

if (!NavbarMenuSettingsModel.schema.path('navMenuStyle')) {
  NavbarMenuSettingsModel.schema.add({
    navMenuStyle: {
      barBackgroundColor: { type: String, default: '#ffffff', trim: true },
      barTextColor: { type: String, default: '#334155', trim: true },
      barHoverBackgroundColor: { type: String, default: '#f1f5f9', trim: true },
      dropdownBackgroundColor: { type: String, default: '#ffffff', trim: true },
      dropdownTextColor: { type: String, default: '#334155', trim: true },
      dropdownMutedTextColor: { type: String, default: '#64748b', trim: true },
      dropdownBorderColor: { type: String, default: '#e2e8f0', trim: true },
    },
  });
}

if (!NavbarMenuSettingsModel.schema.path('navMenuUseParentCategories')) {
  NavbarMenuSettingsModel.schema.add({
    navMenuUseParentCategories: {
      type: Boolean,
      default: false,
    },
  });
}

if (!NavbarMenuSettingsModel.schema.path('footerLogoSameAsNavbar')) {
  NavbarMenuSettingsModel.schema.add({
    footerLogoSameAsNavbar: { type: Boolean, default: true },
    footerLogoUrl: { type: String, default: '', trim: true },
    footerLogoWidth: { type: Number, default: 160 },
    footerLogoHeight: { type: Number, default: 40 },
  });
}

export default NavbarMenuSettingsModel;
