sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment"
], function (Controller, History, MessageBox, MessageToast, Fragment) {
    "use strict";

    return Controller.extend("com.template.builder.controller.ObjectPage", {

        formatLevelState: function (sLevelName) {
            var oLevelColors = {
                "HEADER": "Information",    // Blue
                "PAYMENT": "Success",       // Green
                "CLEARING": "Warning"       // Orange
            };
            return oLevelColors[sLevelName] || "None";
        },

        formatLevelText: function (sLevelName) {
            var oLevelTexts = {
                "HEADER": "Header",
                "PAYMENT": "Payment",
                "CLEARING": "Clearing"
            };
            return oLevelTexts[sLevelName] || sLevelName;
        },

        formatTemplateID: function (sUUID, sTemplateType) {
            if (!sUUID) return "";
            var sHexPart = sUUID.substring(sUUID.length - 6).toUpperCase();
            var sSuffix = "TEMPLATE";
            if (sTemplateType) {
                var sTypeUpper = sTemplateType.toUpperCase();
                if (sTypeUpper === "LOCKBOX") {
                    sSuffix = "LBX";
                } else if (sTypeUpper.includes("PAYMENT")) {
                    sSuffix = "PAY";
                } else if (sTypeUpper.includes("CLEARING")) {
                    sSuffix = "CLR";
                }
            }
            return sSuffix + "-" + sTemplateType + "-V1-" + sHexPart;
        },

        onInit: function () {
            // 1. Get the router
            var oRouter = this.getOwnerComponent().getRouter();
            
            // 2. Attach a function to run every time this route is hit
            oRouter.getRoute("RouteObjectPage").attachPatternMatched(this._onObjectMatched, this);

            // 3. Initialize metadata model for progress tracking
            var oMetaModel = new sap.ui.model.json.JSONModel({
                mappingsCount: 0,
                totalCount: 48,
                percentValue: 0,
                unmappedFilterPressed: false
            });
            this.getView().setModel(oMetaModel, "metaModel");
        },

        _onObjectMatched: function (oEvent) {
            var sTemplateId = oEvent.getParameter("arguments").templateId;
            var sPath = "/TemplateMaster(" + sTemplateId + ")"; 

            this.getView().bindElement({
                path: sPath,
                parameters: {
                    $expand: "mappings($expand=field)" 
                }
            });

            // Reset unmapped filter
            this.getView().getModel("metaModel").setProperty("/unmappedFilterPressed", false);
            var oTable = this.byId("mappingTable");
            if (oTable && oTable.getBinding("items")) {
                oTable.getBinding("items").filter([]);
            }
        },

        _updateMappingStats: function () {
            var oTable = this.byId("mappingTable");
            if (!oTable) return;

            var aItems = oTable.getItems();
            var iTotalCount = aItems.length;
            var iMappedCount = 0;

            aItems.forEach(function (oItem) {
                var oContext = oItem.getBindingContext();
                if (oContext) {
                    var sApiField = oContext.getProperty("apiField");
                    if (sApiField && sApiField !== "") {
                        iMappedCount++;
                    }
                }
            });

            var oMetaModel = this.getView().getModel("metaModel");
            oMetaModel.setProperty("/mappingsCount", iMappedCount);
            oMetaModel.setProperty("/totalCount", iTotalCount);
            
            var iPercent = iTotalCount > 0 ? Math.round((iMappedCount / iTotalCount) * 100) : 0;
            oMetaModel.setProperty("/percentValue", iPercent);
        },

        onMappingPropertyChange: function () {
            this._updateMappingStats();
        },

        // ==========================================
        // TOOLBAR MAPPING ACTIONS
        // ==========================================

        onAutoMapStandard: function () {
            var oTable = this.byId("mappingTable");
            if (!oTable) return;

            var aItems = oTable.getItems();
            var iMapped = 0;

            var oStandardMappings = {
                "Lockbox ID": { api: "CompanyCode", rule: "Source", ruleId: "" },
                "Company Code": { api: "CompanyCode", rule: "Source", ruleId: "" },
                "Deposit Date": { api: "ValueDate", rule: "Source", ruleId: "" },
                "Payment Amount": { api: "PaidAmount", rule: "Source", ruleId: "" },
                "Cheque Number": { api: "ChequeNumber", rule: "Source", ruleId: "" },
                "Bank Name": { api: "BankName", rule: "Source", ruleId: "" },
                "Invoice Amount": { api: "InvoiceAmount", rule: "Source", ruleId: "" },
                "Difference Reason": { api: "CustomerReference", rule: "Source", ruleId: "" }
            };

            aItems.forEach(function (oItem) {
                var oContext = oItem.getBindingContext();
                if (oContext) {
                    var sFieldName = oContext.getProperty("field/fieldName");
                    if (sFieldName && oStandardMappings[sFieldName]) {
                        var oMap = oStandardMappings[sFieldName];
                        oContext.setProperty("apiField", oMap.api);
                        oContext.setProperty("mappingRule", oMap.rule);
                        oContext.setProperty("ruleId", oMap.ruleId);
                        iMapped++;
                    }
                }
            });

            this._updateMappingStats();
            MessageToast.show("Standard Auto-Map complete. " + iMapped + " fields mapped.");
        },

        onAutoMapAI: function () {
            var oTable = this.byId("mappingTable");
            if (!oTable) return;

            var aItems = oTable.getItems();
            
            sap.ui.core.BusyIndicator.show(0);
            
            setTimeout(function () {
                sap.ui.core.BusyIndicator.hide();
                var iMapped = 0;

                aItems.forEach(function (oItem) {
                    var oContext = oItem.getBindingContext();
                    if (oContext) {
                        var sApiField = oContext.getProperty("apiField");
                        if (!sApiField || sApiField === "") {
                            var sFieldName = oContext.getProperty("field/fieldName") || "";
                            var sSuggestedApi = "CustomerReference";
                            
                            if (sFieldName.toLowerCase().includes("invoice")) {
                                sSuggestedApi = "InvoiceNumber";
                            } else if (sFieldName.toLowerCase().includes("amount")) {
                                sSuggestedApi = "InvoiceAmount";
                            } else if (sFieldName.toLowerCase().includes("date")) {
                                sSuggestedApi = "ValueDate";
                            } else if (sFieldName.toLowerCase().includes("currency")) {
                                sSuggestedApi = "Currency";
                            } else if (sFieldName.toLowerCase().includes("reference")) {
                                sSuggestedApi = "CustomerReference";
                            }

                            oContext.setProperty("apiField", sSuggestedApi);
                            oContext.setProperty("mappingRule", "Derived");
                            oContext.setProperty("ruleId", "");
                            iMapped++;
                        }
                    }
                });

                this._updateMappingStats();
                MessageToast.show("AI Auto-Map complete. " + iMapped + " fields mapped with AI rules.");
            }.bind(this), 1500);
        },

        onClearAllMappings: function () {
            var oTable = this.byId("mappingTable");
            if (!oTable) return;

            MessageBox.confirm("Are you sure you want to clear all current mapping rules?", {
                title: "Clear Mappings",
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        var aItems = oTable.getItems();
                        aItems.forEach(function (oItem) {
                            var oContext = oItem.getBindingContext();
                            if (oContext) {
                                oContext.setProperty("apiField", "");
                                oContext.setProperty("mappingRule", "");
                                oContext.setProperty("ruleId", "");
                            }
                        });
                        this._updateMappingStats();
                        MessageToast.show("All mapping rules cleared.");
                    }
                }.bind(this)
            });
        },

        onToggleUnmappedFilter: function (oEvent) {
            var bPressed = oEvent.getParameter("pressed");
            var oTable = this.byId("mappingTable");
            if (!oTable) return;

            var oBinding = oTable.getBinding("items");
            if (!oBinding) return;

            var aFilters = [];
            if (bPressed) {
                aFilters.push(new sap.ui.model.Filter({
                    filters: [
                        new sap.ui.model.Filter("apiField", sap.ui.model.FilterOperator.EQ, ""),
                        new sap.ui.model.Filter("apiField", sap.ui.model.FilterOperator.EQ, null)
                    ],
                    and: false
                }));
            }
            oBinding.filter(aFilters);
        },

        // ==========================================
        // DYNAMIC FIELD MAPPING OPERATIONS
        // ==========================================

        onAddMapping: async function () {
            try {
                if (!this.oAddMappingDialog) {
                    this.oAddMappingDialog = await Fragment.load({
                        id: this.getView().getId(),
                        name: "com.template.builder.fragment.AddMappingDialog",
                        controller: this
                    });
                    this.getView().addDependent(this.oAddMappingDialog);
                }
                this.oAddMappingDialog.open();
            } catch (error) {
                console.error("Fragment Load Error:", error);
                MessageToast.show("Error loading field selection dialog");
            }
        },

        onSearchAddMappingField: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var oBinding = oEvent.getSource().getBinding("items");
            var aFilters = [];
            if (sValue && sValue.trim() !== "") {
                aFilters.push(new sap.ui.model.Filter("fieldName", sap.ui.model.FilterOperator.Contains, sValue));
            }
            oBinding.filter(aFilters);
        },

        onConfirmAddMappingField: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (!oSelectedItem) return;

            var oFieldCtx = oSelectedItem.getBindingContext();
            if (!oFieldCtx) return;

            var sFieldId = oFieldCtx.getProperty("ID");
            var oTemplateCtx = this.getView().getBindingContext();
            if (!oTemplateCtx) return;

            var sTemplateId = oTemplateCtx.getProperty("ID");
            
            var oTable = this.byId("mappingTable");
            var iNextSeq = 1;
            if (oTable) {
                iNextSeq = oTable.getItems().length + 1;
            }

            var oODataModel = this.getView().getModel();
            var oListBinding = oODataModel.bindList("/TemplateFieldMapping");

            sap.ui.core.BusyIndicator.show(0);

            oListBinding.create({
                template_ID: sTemplateId,
                field_ID: sFieldId,
                sequenceNo: iNextSeq,
                apiField: "",
                mappingRule: "",
                ruleId: ""
            }).created().then(function () {
                sap.ui.core.BusyIndicator.hide();
                MessageToast.show("Field mapped to template successfully.");
                
                var oTable = this.byId("mappingTable");
                if (oTable && oTable.getBinding("items")) {
                    oTable.getBinding("items").refresh();
                }
            }.bind(this)).catch(function (error) {
                sap.ui.core.BusyIndicator.hide();
                console.error("Add Mapping Error:", error);
                MessageToast.show("Error adding field mapping.");
            });
        },

        onDeleteMapping: function (oEvent) {
            var oItem = oEvent.getSource().getParent();
            var oContext = oItem.getBindingContext();
            if (!oContext) return;

            MessageBox.confirm("Are you sure you want to remove this field mapping?", {
                title: "Confirm Removal",
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        sap.ui.core.BusyIndicator.show(0);
                        oContext.delete().then(function () {
                            sap.ui.core.BusyIndicator.hide();
                            MessageToast.show("Field mapping removed.");
                            this._updateMappingStats();
                        }.bind(this)).catch(function (oError) {
                            sap.ui.core.BusyIndicator.hide();
                            console.error("Delete Mapping Error:", oError);
                            MessageToast.show("Error removing field mapping.");
                        });
                    }
                }.bind(this)
            });
        },

        // ==========================================
        // FOOTER ACTIONS
        // ==========================================

        onPreviewAPIPayload: async function () {
            try {
                var oTemplateCtx = this.getView().getBindingContext();
                if (!oTemplateCtx) return;

                var oTable = this.byId("mappingTable");
                if (!oTable) return;

                var aMappings = [];
                var aItems = oTable.getItems();

                aItems.forEach(function (oItem) {
                    var oContext = oItem.getBindingContext();
                    if (oContext) {
                        aMappings.push({
                            sequenceNo: oContext.getProperty("sequenceNo"),
                            sourceField: oContext.getProperty("field/fieldName"),
                            level: oContext.getProperty("field/levelName"),
                            apiField: oContext.getProperty("apiField") || null,
                            mappingRule: oContext.getProperty("mappingRule") || null,
                            ruleId: oContext.getProperty("ruleId") || null
                        });
                    }
                });

                var oPayload = {
                    templateId: oTemplateCtx.getProperty("ID"),
                    templateName: oTemplateCtx.getProperty("templateName"),
                    templateType: oTemplateCtx.getProperty("templateType"),
                    sheetMode: oTemplateCtx.getProperty("sheetMode"),
                    mappings: aMappings
                };

                var sJson = JSON.stringify(oPayload, null, 4);

                if (!this.oPreviewDialog) {
                    this.oPreviewDialog = await Fragment.load({
                        id: this.getView().getId(),
                        name: "com.template.builder.fragment.PreviewPayloadDialog",
                        controller: this
                    });
                    this.getView().addDependent(this.oPreviewDialog);
                }

                this.oPreviewDialog.open();
                Fragment.byId(this.getView().getId(), "payloadTextArea").setValue(sJson);
            } catch (error) {
                console.error("Payload Preview Error:", error);
                MessageToast.show("Error loading payload preview");
            }
        },

        onCopyPayloadToClipboard: function () {
            var oTextArea = Fragment.byId(this.getView().getId(), "payloadTextArea");
            if (oTextArea) {
                var sText = oTextArea.getValue();
                navigator.clipboard.writeText(sText).then(function () {
                    MessageToast.show("Payload copied to clipboard!");
                }).catch(function (err) {
                    console.error("Clipboard Error:", err);
                    MessageToast.show("Could not copy payload.");
                });
            }
        },

        onClosePreviewDialog: function () {
            if (this.oPreviewDialog) {
                this.oPreviewDialog.close();
            }
        },

        onValidateMapping: function () {
            var oTable = this.byId("mappingTable");
            if (!oTable) return;

            var aItems = oTable.getItems();
            var aErrors = [];
            var aWarnings = [];

            aItems.forEach(function (oItem) {
                var oContext = oItem.getBindingContext();
                if (oContext) {
                    var sFieldName = oContext.getProperty("field/fieldName");
                    var sApiField = oContext.getProperty("apiField");
                    var sRule = oContext.getProperty("mappingRule");
                    var bRequired = oContext.getProperty("field/isRequired");

                    if (!sApiField || sApiField === "") {
                        if (bRequired) {
                            aErrors.push("Required source field '" + sFieldName + "' is not mapped to an API Field.");
                        } else {
                            aWarnings.push("Optional source field '" + sFieldName + "' has no API Field mapping.");
                        }
                    } else {
                        if (!sRule || sRule === "") {
                            aErrors.push("Mapped field '" + sFieldName + "' is missing a Mapping Rule.");
                        }
                    }
                }
            });

            if (aErrors.length > 0) {
                var sMessage = "Validation Failed:\n\n" + aErrors.join("\n") + "\n\n";
                if (aWarnings.length > 0) {
                    sMessage += "Warnings:\n" + aWarnings.join("\n");
                }
                MessageBox.error(sMessage, {
                    title: "Mapping Validation Error"
                });
            } else if (aWarnings.length > 0) {
                var sMessage = "Validation Successful (with warnings):\n\n" + aWarnings.join("\n");
                MessageBox.warning(sMessage, {
                    title: "Mapping Validation Warning"
                });
            } else {
                MessageBox.success("Validation Successful! All template fields are correctly configured and mapped to API endpoints.", {
                    title: "Mapping Validation Success"
                });
            }
        },

        onSaveChanges: function () {
            var oODataModel = this.getView().getModel();
            
            sap.ui.core.BusyIndicator.show(0);
            
            oODataModel.submitBatch(oODataModel.getUpdateGroupId()).then(function () {
                sap.ui.core.BusyIndicator.hide();
                MessageToast.show("All mapping changes saved persistently to the database!");
                this._updateMappingStats();
            }.bind(this)).catch(function (error) {
                sap.ui.core.BusyIndicator.hide();
                console.error("Save Changes Error:", error);
                MessageToast.show("Error saving changes.");
            });
        },

        // ==========================================
        // UTILITIES & NAVIGATION
        // ==========================================

        onNavBack: function () {
            var oHistory = History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                var oRouter = this.getOwnerComponent().getRouter();
                oRouter.navTo("RouteHome", {}, true);
            }
        }
    });
});