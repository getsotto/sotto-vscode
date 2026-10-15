# Contributing

Thanks for helping with Sotto for Visual Studio Code. Keep changes focused and describe the user-visible problem and behavior in pull requests. Use British English in prose and sign off every commit under the Developer Certificate of Origin.

## Development

Use Node.js 22 and npm. From a clean checkout:

```sh
npm ci
npm run lint
npm run check-types
npm run compile
npm run package
```

The project is still being scaffolded. There is no supported extension workflow yet.

## Commit sign-off

Sign off each commit with `git commit -s`. Git uses your configured name and email to add a `Signed-off-by` line certifying that you have the right to submit the change under the Apache-2.0 licence.

See the [Developer Certificate of Origin](https://developercertificate.org) for the certification text.
