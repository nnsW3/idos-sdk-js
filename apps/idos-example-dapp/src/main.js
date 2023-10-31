import { ethers } from "ethers";

import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui-js";
import "@near-wallet-selector/modal-ui-js/styles.css";

import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupNightly } from "@near-wallet-selector/nightly";

import { idOS } from "@idos-network/idos-sdk";
import { Terminal } from "./terminal";


/*
 * Initializing the idOS
 *
 */
const idos = await idOS.init({ container: "#idos-container" });


/*
 * Setting up the demo
 *
 */
const terminal = new Terminal("#terminal", idos);
document.querySelector("button#reset").addEventListener("click", async e => {
  window.localStorage.clear();
  await idos.reset({ enclave: true, reload: true });
});

let chosenWallet = window.localStorage.getItem("chosen-wallet");

if (!chosenWallet) {
  await new Promise((resolve) => {
    const walletChooser = document.querySelector("#wallet-chooser");
    walletChooser.style.display = "block";
    walletChooser.addEventListener("submit", async (e) => {
      e.preventDefault();
      walletChooser.style.display = "none";

      chosenWallet = e.submitter.name;
      window.localStorage.setItem("chosen-wallet", chosenWallet);
      resolve();
    });
  });
}

const connectWallet = {
  EVM: async () => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    return provider.getSigner();
  },

  NEAR: async () => {
    const {
      defaultContractId: contractId,
      contractMethods: methodNames,
    } = idOS.near;

    const selector = await setupWalletSelector({
      network: idOS.near.defaultNetwork,
      modules: [setupHereWallet(), setupMeteorWallet(), setupMyNearWallet(), setupNightly()],
    });

    !selector.isSignedIn() && await new Promise((resolve) => {
      const modal = setupModal(selector, { contractId, methodNames });

      // NOTE: `setTimeout` gives Meteor's extension a chance to breathe.
      // We observe that it triggers this callback before it's ready for a
      // second method call, which `setNearSigner` does immediately after
      // this promise resolves
      modal.on("onHide", () => setTimeout(resolve, 100));
      modal.show();
    });

    return selector.wallet();
  }
};

/*
 * 🚀 idOS, here we go!
 *
 */
(async () => {
  /*
   * Connecting a wallet
   *
   */
  const signer = await terminal
    .h1("rocket", "idOS connection")
    .h2("Node URL")
    .log(idos.nodeUrl)
    .wait("awaiting wallet", connectWallet[chosenWallet]());

  if (!signer) return;

  /*
   * Are you in the idOS?
   *
   */
  const currentUser = await terminal.wait(
    "awaiting idOS setup (signatures and password)",
    idos.setSigner(chosenWallet, signer),
  );

  if (!currentUser) return;

  const {humanId, address, publicKey} = currentUser;

  if (!humanId) {
    terminal
      .h1("pleading", "No idOS profile found")
      .h2(`Need an idOS profile?`)
      .log(`Get one at <a href="${idOS.profileProviders[0]}">Fractal ID</a>`)
      .h2(`Already have one?`)
      .log(`Please connect the right signer`)
      .h1("eyes", `Currently connected signer:`)
      .table({ address, publicKey })
      .done();
    return;
  }

  /*
   * idOS queries
   *
   */
  terminal
    .h2("Your idOS ID")
    .log(humanId);

  await terminal
    .h1("ask", "Consent request")
    .log("(optional) you can use our SDK as consent UI")
    .wait("timer", new Promise(resolve => setTimeout(resolve, 500)));

  const consent = await terminal
    .wait("awaiting consent", idos.crypto.confirm(`
      Do we have your consent to read data from the idOS?
    `));

  terminal
    .h2("Consent")
    .log(consent);

  if (!consent) {
    terminal.done();
    return;
  }

  const wallets = await terminal
    .h1("eyes", "Your wallets")
    .wait("awaiting signature", idos.data.list("wallets"));
  terminal.table(wallets, ["address", "public_key"]);

  let credentials = await terminal
    .h1("eyes", "Your credentials")
    .wait("awaiting signature", idos.data.list("credentials"));
  terminal.table(await credentials, ["issuer", "credential_type", "id", "encryption_public_key"]);

  let grants = await terminal
    .h1("eyes", "Your grants")
    .wait("awaiting RPC", idos.grants.list({ owner: address }));
  terminal.table(await grants);

  terminal.done();
})();
