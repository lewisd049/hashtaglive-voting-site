<div class="hashtaglive-voting-qr">

  <div class="hashtaglive-voting-qr-title">
    Scan to vote
  </div>

  <div
    id="hashtagLiveVotingQR"
    class="hashtaglive-voting-qr-code"
  ></div>

  <div class="hashtaglive-voting-qr-url">
    go.tdf1.uk/vote
  </div>

</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>

<script>
document.addEventListener(
  "DOMContentLoaded",
  function () {

    const qr =
      document.getElementById(
        "hashtagLiveVotingQR"
      );

    if (!qr) return;

    new QRCode(
      qr,
      {
        text:
          "https://go.tdf1.uk/hashtaglive-live-voting-website-qr-code-1",

        width: 220,

        height: 220,

        correctLevel:
          QRCode.CorrectLevel.H
      }
    );

  }
);
</script>
