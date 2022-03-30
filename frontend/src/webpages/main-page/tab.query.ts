const afterDateElement: HTMLInputElement =
  document.querySelector("[data-bind=after]")

const beforeDateElement: HTMLInputElement =
  document.querySelector("[data-bind=before]")

qParams.onChange("after", (newDate) => {
  beforeDateElement.min = newDate
})

qParams.onChange("before", (newDate) => {
  afterDateElement.max = newDate
})
