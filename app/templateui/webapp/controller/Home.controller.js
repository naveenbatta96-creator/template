sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/export/Spreadsheet",
    "sap/ui/export/library",
    "sap/ui/core/util/File"

], function (Controller, Fragment, MessageToast, JSONModel, Filter, FilterOperator, Spreadsheet, exportLibrary, File) {
    "use strict";

    return Controller.extend("com.template.builder.controller.Home", {

        //===================================================================================================
        // Formatter Functions
        //===================================================================================================
        formatDate: function (sDate) {
            if (!sDate) return "";
            var oDate = new Date(sDate);
            var oFormatter = sap.ui.core.format.DateFormat.getInstance({
                pattern: "MMM dd, yyyy, hh:mm a"
            });
            return oFormatter.format(oDate);
        },

        formatTemplateID: function (sUUID, sTemplateType) {
            if (!sUUID) return "";
            // Extract last 6 characters from UUID and convert to uppercase
            var sHexPart = sUUID.substring(sUUID.length - 6).toUpperCase();

            // Map template type to suffix
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

        formatCustomBadge: function (sId) {
            if (!sId) {
                return false;
            }
            var aStandardPrefixes = ["1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1010"];
            var bIsStandard = aStandardPrefixes.some(function (sPrefix) {
                return sId.startsWith(sPrefix);
            });
            return !bIsStandard;
        },

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

        //===================================================================================================
        // Controller Lifecycle Methods
        //===================================================================================================
        onInit: function () {
            // 1. Create a new JSON Model to hold our counter data
            var oCounterModel = new JSONModel({
                selectedCount: 0
            });

            // 2. Attach it to the View so your other functions can find it!
            this.getView().setModel(oCounterModel, "counterModel");
        },

        //=====================================================================================================
        // Event Handlers
        //=====================================================================================================

        onTableSelectionChange: function (oEvent) {
            var oTable = oEvent.getSource();
            var iSelectedcount = oTable.getSelectedItems().length;

            // FIXED: Added .getView()
            this.getView().getModel("counterModel").setProperty("/selectedCount", iSelectedcount);
        },

        onCreateTemplate: async function () {
            console.log("Create Template Clicked");
            try {
                if (!this.oCreateDialog) {
                    this.oCreateDialog = await Fragment.load({
                        id: this.getView().getId(),
                        name: "com.template.builder.fragment.CreateTemplateDialog",
                        controller: this
                    });
                    this.getView().addDependent(this.oCreateDialog);
                }
                this._resetDialogFields();
                this.oCreateDialog.open();
            } catch (error) {
                console.error("Fragment Load Error:", error);
                MessageToast.show("Error loading dialog");
            }
        },

        _resetDialogFields: function () {
            Fragment.byId(this.getView().getId(), "templateNameInput").setValue("");
            Fragment.byId(this.getView().getId(), "templateTypeSelect").setSelectedKey("LOCKBOX");
            Fragment.byId(this.getView().getId(), "sheetModeSelect").setSelectedKey("SINGLE");

            var oTable = this.byId("fieldsTable") || Fragment.byId(this.getView().getId(), "fieldsTable");
            if (oTable) {
                oTable.removeSelections(true);
            }
            this.getView().getModel("counterModel").setProperty("/selectedCount", 0);
        },

        onCloseDialog: function () {
            if (this.oCreateDialog) {
                this.oCreateDialog.close();
            }
        },

        onSaveTemplate: function () {
            try {
                const sTemplateName = Fragment.byId(this.getView().getId(), "templateNameInput").getValue();
                const sTemplateType = Fragment.byId(this.getView().getId(), "templateTypeSelect").getSelectedKey();
                const sSheetMode = Fragment.byId(this.getView().getId(), "sheetModeSelect").getSelectedKey();

                // 1. GET SELECTED FIELDS
                const aSelectedFields = this._getSelectedFields();
                console.log("Selected Fields for DB:", aSelectedFields);

                // VALIDATION
                if (!sTemplateName || !sTemplateName.trim()) {
                    MessageToast.show("Please enter template name");
                    return;
                }

                if (aSelectedFields.length === 0) {
                    MessageToast.show("Please select at least one field");
                    return;
                }

                // 2. CONSTRUCT THE DEEP INSERT PAYLOAD FOR CAPM
                const aMappingsPayload = aSelectedFields.map(function (oField, index) {
                    return {
                        field_ID: oField.ID,
                        sequenceNo: index + 1
                    };
                });

                const oTemplatePayload = {
                    templateName: sTemplateName,
                    templateType: sTemplateType,
                    sheetMode: sSheetMode,
                    status: "ACTIVE",
                    mappings: aMappingsPayload
                };

                // 3. TARGET DEFAULT ODATA V4 MODEL
                const oODataModel = this.getView().getModel();

                // 4. BIND LIST TO THE BASE ENTITY SET (Required for POST)
                const oListBinding = oODataModel.bindList("/TemplateMaster");

                sap.ui.core.BusyIndicator.show(0);

                // 5. EXECUTE THE V4 CREATE OPERATION
                const oNewContext = oListBinding.create(oTemplatePayload);

                // 6. ODATA V4 PROMISE HANDLING
                oNewContext.created().then(function () {
                    sap.ui.core.BusyIndicator.hide();
                    MessageToast.show("Template saved persistently to SQLite via CAPM!");

                    // NEW: Refresh the table so the backend View recalculates the counts
                    var oTable = this.byId("templateTable");
                    if (oTable && oTable.getBinding("items")) {
                        oTable.getBinding("items").refresh();
                    }

                    this.onCloseDialog();
                }.bind(this)).catch(function (oError) {
                    sap.ui.core.BusyIndicator.hide();
                    console.error("CAPM Server Save Error:", oError);
                    MessageToast.show("Error writing records to persistent storage.");
                });

            } catch (error) {
                sap.ui.core.BusyIndicator.hide();
                console.error("Save Error Execution:", error);
                MessageToast.show("Error saving template");
            }
        },

        _getSelectedFields: function () {
            var oTable = this.byId("fieldsTable") || Fragment.byId(this.getView().getId(), "fieldsTable");
            var aFields = [];

            if (!oTable) {
                console.error("Table 'fieldsTable' not found in View or Fragment context.");
                return aFields;
            }

            var aSelectedItems = oTable.getSelectedItems();

            // FIXED: Added .getView()
            this.getView().getModel("counterModel").setProperty("/selectedCount", aSelectedItems.length);

            aSelectedItems.forEach(function (oItem) {
                var oContext = oItem.getBindingContext();

                if (oContext) {
                    var oData = oContext.getObject();
                    aFields.push({
                        ID: oData.ID,
                        fieldName: oData.fieldName,
                        levelName: oData.levelName,
                        sapType: oData.sapType
                    });
                }
            });

            return aFields;
        },

        onDownloadExcel: function (oEvent) {
            var oItem = oEvent.getSource().getParent();
            var oContext = oItem.getBindingContext();
            if (!oContext) return;

            var sTemplateId = oContext.getProperty("ID");
            var sSheetMode = oContext.getProperty("sheetMode");

            var sUrl = "/odata/v4/template/downloadTemplate";

            sap.ui.core.BusyIndicator.show(0);

            fetch(sUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    templateID: sTemplateId,
                    exportMode: sSheetMode
                })
            })
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error("Network response was not ok");
                    }
                    return response.blob();
                })
                .then(function (blob) {
                    sap.ui.core.BusyIndicator.hide();
                    File.save(blob, oContext.getProperty("templateName") + "_Configuration", "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                })
                .catch(function (error) {
                    sap.ui.core.BusyIndicator.hide();
                    console.error("Download Error:", error);
                    MessageToast.show("Error downloading template");
                });
        },

        onDeleteTemplate: function (oEvent) {
            const oItem = oEvent.getSource().getParent();
            const oContext = oItem.getBindingContext();

            if (!oContext) return;

            sap.ui.core.BusyIndicator.show(0);

            oContext.delete().then(function () {
                sap.ui.core.BusyIndicator.hide();
                MessageToast.show("Template deleted from SQLite database.");
            }).catch(function (oError) {
                sap.ui.core.BusyIndicator.hide();
                console.error("Delete Fail:", oError);
                MessageToast.show("Could not remove template.");
            });
        },

        onLevelFilterChange: function (oEvent) {
            var sKey = oEvent.getSource().getSelectedKey();
            var oTable = this.byId("fieldsTable") || Fragment.byId(this.getView().getId(), "fieldsTable");

            if (!oTable) return;

            var oBinding = oTable.getBinding("items");
            if (!oBinding) return;

            var aFilters = [];
            if (sKey !== "ALL") {
                aFilters.push(
                    new Filter("levelName", FilterOperator.EQ, sKey)
                );
            }

            oBinding.filter(aFilters);
        },

        onAddNewField: async function () {
            try {
                if (!this.oAddFieldDialog) {
                    this.oAddFieldDialog = await Fragment.load({
                        id: this.getView().getId(),
                        name: "com.template.builder.fragment.AddFieldDialog",
                        controller: this
                    });
                    this.getView().addDependent(this.oAddFieldDialog);
                }
                this._resetAddFieldFields();
                this.oAddFieldDialog.open();
            } catch (error) {
                console.error("Fragment Load Error:", error);
                MessageToast.show("Error loading add field dialog");
            }
        },

        _resetAddFieldFields: function () {
            Fragment.byId(this.getView().getId(), "newFieldNameInput").setValue("");
            Fragment.byId(this.getView().getId(), "newLevelSelect").setSelectedKey("HEADER");
            Fragment.byId(this.getView().getId(), "newPropertySelect").setSelectedKey("OPTIONAL");
            Fragment.byId(this.getView().getId(), "newFieldLengthInput").setValue("50");
        },

        onLengthLiveChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var sValue = oInput.getValue();
            if (sValue) {
                var iValue = parseInt(sValue, 10);
                if (isNaN(iValue) || iValue < 1) {
                    oInput.setValue("");
                } else if (iValue > 50) {
                    oInput.setValue("50");
                    MessageToast.show("Maximum length allowed is 50");
                }
            }
        },

        onCloseAddFieldDialog: function () {
            if (this.oAddFieldDialog) {
                this.oAddFieldDialog.close();
            }
        },

        onSaveNewField: function () {
            try {
                const sFieldName = Fragment.byId(this.getView().getId(), "newFieldNameInput").getValue();
                const sLevel = Fragment.byId(this.getView().getId(), "newLevelSelect").getSelectedKey();
                const sProperty = Fragment.byId(this.getView().getId(), "newPropertySelect").getSelectedKey();
                const sFieldLength = Fragment.byId(this.getView().getId(), "newFieldLengthInput").getValue();

                if (!sFieldName || !sFieldName.trim()) {
                    MessageToast.show("Please enter a field description");
                    return;
                }

                if (!sFieldLength || !sFieldLength.trim()) {
                    MessageToast.show("Please enter field length");
                    return;
                }

                const iLength = parseInt(sFieldLength, 10);
                if (isNaN(iLength) || iLength < 1 || iLength > 50) {
                    MessageToast.show("Length must be a number between 1 and 50");
                    return;
                }

                const oPayload = {
                    levelName: sLevel,
                    fieldName: sFieldName,
                    sapType: "CHAR", // Default type for general catalog fields
                    fieldLength: sFieldLength,
                    propertyType: "Standard",
                    isRequired: sProperty === "REQUIRED"
                };

                const oODataModel = this.getView().getModel();
                const oListBinding = oODataModel.bindList("/FieldMaster");

                sap.ui.core.BusyIndicator.show(0);

                const oNewContext = oListBinding.create(oPayload);

                oNewContext.created().then(function () {
                    sap.ui.core.BusyIndicator.hide();
                    MessageToast.show("New field added to catalog!");

                    // Table updates automatically, but we can refresh the list binding just in case
                    var oTable = this.byId("fieldsTable") || Fragment.byId(this.getView().getId(), "fieldsTable");
                    if (oTable && oTable.getBinding("items")) {
                        oTable.getBinding("items").refresh();
                    }

                    this.onCloseAddFieldDialog();
                }.bind(this)).catch(function (oError) {
                    sap.ui.core.BusyIndicator.hide();
                    console.error("Save Field Error:", oError);
                    MessageToast.show("Error adding new field to storage.");
                });

            } catch (error) {
                sap.ui.core.BusyIndicator.hide();
                console.error("Save Field Execution Error:", error);
                MessageToast.show("Error saving new field");
            }
        },

        // ==========================================
        // ROW PRESS NAVIGATION
        // ==========================================

        onRowPress: function (oEvent) {
            var oItem = oEvent.getSource();
            var oContext = oItem.getBindingContext();

            if (!oContext) {
                return;
            }

            var sTemplateId = oContext.getProperty("ID");
            var oRouter = this.getOwnerComponent().getRouter();

            oRouter.navTo("RouteObjectPage", {
                templateId: sTemplateId
            });
        }

    });
});