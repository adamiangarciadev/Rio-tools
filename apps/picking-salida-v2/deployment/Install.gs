/* Resources already created for this installation. No secrets. */
function installPreparedPickingV2(){
 var props=PropertiesService.getScriptProperties();
 if(props.getProperty('PICKING_CONFIG'))throw new Error('Ya configurado: no se sobrescribe.');
 var cfg={
  "rootFolderId": "1Q5k0J89semidbtDvnoNXLL9-OLi27Q5w",
  "controlId": "121ZB1cW4h1BYcWlmN0bCOwdaJ6nsNPOOu2yzNzILzhs",
  "cuadernoId": "1po-vnBSdLFGVmGVbzaCsCHLMS-rIxjCsp6NW3fU656o",
  "cuadernoSheet": "CUADERNILLO",
  "backupFolderId": "1DYLTqIyzF5wXsuKPxv0C9_1MKIBKL5w0",
  "txtRootId": "1P3fBt9zxPEhOY0q2XCiP0fbW1Yp8ihqj",
  "routes": {
    "DEPOSITO>AV2": "1EzvopnR0encm7-5r5y1swcPwJplWYIWQ",
    "DEPOSITO>NAZCA": "1MnbUUdat92qF9F4mZa6Pw0brcRUb2kHk",
    "DEPOSITO>LAMARCA": "1J1GX1L4BpMq52r9tUIouPWxfMZFVFAP5",
    "DEPOSITO>CORRIENTES": "1IV_y1mS8CwI-cIRFONEvOapsbY1KxvBu",
    "DEPOSITO>CASTELLI": "1Gq96y01kaoZw7c7BROWpHB0QNpqkiisq",
    "DEPOSITO>QUILMES": "1EYJpkMdZ4A1HKj1ZL6jwP8N47KevYSZB",
    "DEPOSITO>SARMIENTO": "1kzlFnxGCmMK6vDQde6xpbS_zb0Dtk3Ry",
    "DEPOSITO>DEPOSITO": "1acB8br2UK7ggz8njmHepG5IWDLbpAnTx",
    "DEPOSITO>PUEYRREDON": "1ThxWyRUxxBj-jANB3CYbxIgpLcuOTyjn",
    "AV2>AV2": "1Mq8plmxjiR045jdVxL03S3sCW1EBCyK3",
    "AV2>NAZCA": "1-s3VWySYt0_n_3718rX8yRdQG89LmTt5",
    "AV2>LAMARCA": "1mWrKexXvMjTIktc5jFqkBVe3iG3H63Kl",
    "AV2>CORRIENTES": "1xO-wFoRA679_V0xEl5whvQ7kUfOk4vLx",
    "AV2>CASTELLI": "1irvIDuAHwbePfQ7ZcWWOpIaPD-ncmx5H",
    "AV2>QUILMES": "1rxDWF0C83y4yhnDycdAVT2tPtT0LxiBz",
    "AV2>SARMIENTO": "1TiGNuXfEAAzn61Cx5dReGMcP5yArqzDd",
    "AV2>DEPOSITO": "16tUdCgucnzjZOJHrp6AToxymFhnMC0Ln",
    "AV2>PUEYRREDON": "17cnhqSQSWcjFaDj6fl1zDkz9tbpPp7Ib",
    "SARMIENTO>AV2": "13MeCzoI3ezXymw5FTM_gd6b4me7hurXz",
    "SARMIENTO>NAZCA": "1tEE-7rKcVaV3NqaKX3UD6Z23gf8EUt_F",
    "SARMIENTO>LAMARCA": "1-dQk_rxlcYHReOWsx5kNsSDwkcTUHk6O",
    "SARMIENTO>CORRIENTES": "1Be7cFQ2mbS5aO_IXum4q2KMWHOVwSVMo",
    "SARMIENTO>CASTELLI": "1sBn3z5hjTk1H-9Yq4EQQrJjwdQhHVTEG",
    "SARMIENTO>QUILMES": "1goozxvVyb1s8r_6-vHWbnL8bNXXXtoyR",
    "SARMIENTO>SARMIENTO": "1P7CzgLXvmJg6owYolLN0avNRKz9M-oEK",
    "SARMIENTO>DEPOSITO": "1c-rxrv2g1vkWh5YfPa9MlJlg4O8O8R2I",
    "SARMIENTO>PUEYRREDON": "102f82igx-LK9_O7FGiYgmf8zGOWv0UFe",
    "PUEYRREDON>AV2": "13Gejj7S_O_BFOSPJRvsuxEs5KXb7APeV",
    "PUEYRREDON>NAZCA": "18iUO9jndjdoCw2CjgmWJUeuWboinnjcw",
    "PUEYRREDON>LAMARCA": "1dEu_lq-zPekPHm3Z1wUe3OoiS8ssZfBB",
    "PUEYRREDON>CORRIENTES": "1nXdx2Ida7YsYv5uTWaDFBXpZIzvXn-UX",
    "PUEYRREDON>CASTELLI": "10xZi24awGcgrDh0AAdIN_z88UeYsD7lN",
    "PUEYRREDON>QUILMES": "1CODcNCNsFpZljqaI4JyxZ3TpkGz90HpC",
    "PUEYRREDON>SARMIENTO": "15xMKif4w3G7zKfib2raiOURe2cihcub6",
    "PUEYRREDON>DEPOSITO": "1gwx1CQTxZDPx4W7NFxVHNpUER1xT0Say",
    "PUEYRREDON>PUEYRREDON": "15T5DiyJ2sBxd3x1cWVaPaYpP788YITks"
  },
  "mode": "pilot",
  "users": {
    "sistemas.rio23@gmail.com": {
      "enabled": true,
      "role": "admin",
      "origins": [
        "DEPOSITO",
        "AV2",
        "SARMIENTO",
        "PUEYRREDON"
      ]
    }
  },
  "scriptId": "1aPLGPUhjI66xPG45cJJINFef9Ur4Ulz8pGMEwtvPbR_7cblp-T-uaXAt"
};
 var control=SpreadsheetApp.openById(cfg.controlId),book=SpreadsheetApp.openById(cfg.cuadernoId);
 if(!control.getSheetByName('CONTROL')||!control.getSheetByName('PENDIENTES')||!book.getSheetByName(cfg.cuadernoSheet))throw new Error('Pestañas incompletas.');
 DriveApp.getFolderById(cfg.backupFolderId).getName();
 Object.keys(cfg.routes).forEach(function(k){DriveApp.getFolderById(cfg.routes[k]).getName();});
 control.setSpreadsheetTimeZone('America/Argentina/Buenos_Aires');book.setSpreadsheetTimeZone('America/Argentina/Buenos_Aires');
 props.setProperty('PICKING_CONFIG',JSON.stringify(cfg));

 installPickingRecovery();
 console.log('Instalación piloto preparada. Cuadernillo: '+book.getUrl());
}
