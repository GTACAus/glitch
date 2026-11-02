const btn = document.querySelector("#btn");
const count = document.querySelector("#count");
let clicks = 0;

btn.addEventListener("click", () => {
  clicks++;
  count.textContent = `Clicked ${clicks} time${clicks === 1 ? "" : "s"}`;
  console.log("click!", clicks);
});
