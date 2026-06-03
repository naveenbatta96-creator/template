sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel"
], function (UIComponent, JSONModel) {
    "use strict";

    return UIComponent.extend("com.template.builder.Component", {

        metadata: {
            manifest: "json"
        },

        init: function () {
            // Call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // 1. Instantiating the model correctly on the Component level
            const oModel = new JSONModel({
                templates: []
            });
            
            // 2. Since "this" IS the component here, attach the model directly to it
            this.setModel(oModel, "templateModel");

            // Initialize router after component setup
            this.getRouter().initialize();
        }
    });
});