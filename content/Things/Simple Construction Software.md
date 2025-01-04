---
aliases:
  - Simple Construction
created: 2025-01-04
updated: 2025-01-04
share: true
---
#seed 

# Simple Construction Software

## I.
Simple Construction was a no-code tool for automating contract changes in construction and was my second startup, which I founded after leaving [[./Modernbanc|Modernbanc]] to join the next [[./Entrepreneur First|Entrepreneur First]] cohort in London. 

Before a construction project can begin, a signed contract describing project scope, schedule and costs is required. Included are detailed communication procedures to compliantly handle changes to scope, schedule and costs during the project. 

The process is often very messy. Communication is fragmented across dozens of WhatsApp and email inboxes, and submissions often exclude key information and contain errors.

We were attempting to fix the problem by turning change processes into big static JSON definitions for what were essentially a combination of a form builder and a state machine.

Process definitions would then be visualised like this:
![[../Assets/simple-construction-software-workflow.png|simple-construction-software-workflow.png]]

We ended up being funded by both [EF](https://joinef.com) and [Brick & Mortar](https://brickmortar.vc/) ventures in the early days, but our attempts to raise a seed round faltered. On paper, I think we were a great team, but a combination of our own mistakes and some environmental headwinds proved too much to overcome.

We applied to the YC S22 batch and were invited to interview. Our application is [here](https://docs.google.com/document/d/18Nmau-CYf8Fj_josgYZNpDPLG-pCOdZtxl4pUnmMNvs/edit?usp=sharing) if you care. YC interviews are fucking terrifying. 10 minutes to convince a wall of massive names to give you 500k, and the short version is that we didn't make the cut.

I think the rejection reason given really did cut to the bone of our problem - tricky tricky [[./Incentives|incentive alignment]].

> Hi Stuart and Andrius,  
> 
> Unfortunately, we've decided not to fund Simple Construction Software this batch.  
> 
> This was a tough decision because we’re impressed with your individual backgrounds, and you seem like a great team together. We also liked that you have an ongoing paid pilot with a large potential customer, and that you're making progress with them.  
> 
> But while it sounds like a real problem, it’s still not clear that you’ll be able to get customers to fully adopt your software to ultimately solve it. We’ve seen similar kinds of tools in the past, where if users aren’t incentivized enough to fully adopt the new software to become the absolute system of record, then it all falls apart and no one ends up using it. We’d just want to see more evidence that you’ll be able to pull this off.
  
## II.

Here's a hopefully comprehensive account of everything we did wrong.

### Mistake 1 - Inflated fundraising expectations
We didn't know it yet, but rates of startup funding had halved since we started our company. Simple construction was founded at the start of Q3 2021, right at the peak. A lot of rounds that seemed incredulous to us were being announced all over the place, and we had FOMO. 

We then tried to raise in what has come to be the worst quarter since COVID-19 recovery started.

![[../Assets/simple-construction-software-fundraising.png|simple-construction-software-fundraising.png]]

### Mistake 2 - Priced round
We tried to do a priced round when in retrospect SAFEs were almost unanimous amongst founders in our position. This wasn't a major thing that stabbed us, but it made the effects of mistake #1 much more intense - SAFEs allow you to take in funds on a continuous basis rather than in one go - a rolling close.  

We got plenty of commitments from generalist VCs who all wanted a specialist investor to lead the round. The problem with that is that when fundraising markets contract, the ones not getting much funding to begin with tend to contract the hardest. Construction is notorious for being resistant to digitisation, and historically hasn't delivered strong results to investors. Autodesk's [$875M acquisition of PlanGrid](https://techcrunch.com/2018/11/20/autodesk-agrees-to-buy-plangrid-for-875-million/) stood as pretty much the sole exception to that rule, and that was some years previously.

Additionally, [Katerra](https://en.wikipedia.org/wiki/Katerra), who had raised over *2 billion dollars* in venture and private equity funding, collapsed in June 2021, leaving a sour taste in the mouths of many investors. 

Fundraising is very momentum based. Requiring a lead to close any funds was an error that left us without the resources to grow quickly, and made it that much harder to keep enough momentum to close the round.

### Mistake 3 - Multi-team dependence
Good execution is enough to overcome most barriers. If ours was good enough, it would have been too. The biggest reason that it wasn't is, as YC partner [Aaron Epstein](https://www.ycombinator.com/people/aaron-epstein) pointed out to us in feedback, that we struggled to create enough adoption incentives.

We knew going in that construction was a highly adversarial environment. The way we saw it, the client was the payer, so had the power to mandate tool usage down the supply chain. When we spoke to people in the industry, contractors shrugged and said they used whatever the client told them to use.

For that reason, our strategy was to optimise for client ergonomics - they were the one that would pay us, and so we tried to make their life as easy as possible. The biggest problem with this approach is the amount of buy-in we required to launch successfully on a project was *tremendous*. Everyone had to adhere to the prescribed processes in the tool, and that meant every member of every contractor and client needed to be onboarded and bought-in to submitting events via the tool.

This created a chicken-and-egg problem where we didn't have enough trust for a full deployment, and we didn't have enough full deployments to build trust.

If I could go back in time and re-do Simple Construction, I would focus on making it useful to one person to manage their inbox better. I think there's a version of the tool possible where you just forward emails to a dedicated Simple Construction inbox, and then it sorts out the structuring for you. Maybe our timing was off for this. 

It's insane to think of as I write this now in a world where ChatGPT is unanimous, but the prevailing consensus in the industry at the time was that trying to structure unstructured data algorithmically (especially as it related to very expensive contractual obligations) was a fool's errand because you'd never be able to achieve a high enough accuracy that clients could rely on it. 

I think the current generation of document ingestion tools that focus on structuring and extracting data from existing forms is absolutely the right way to go because it's much more seamless. I digress.

### In summary
Construction was a tough nut to crack, and the incentive alignment was too tricky for us to solve in the time we had. I learned a lot about business, about building things, and about startup fundraising cycles, and so on and so on. All that generic crap that people say when their project fails because they want to sound like an optimist about it.

All I can say is that I tried my best, and that my best at that time was not enough to achieve the result I wanted. But at the very least, the standard of my best improved as a consequence.

## III.

I do think there were some things we did right. I'm biased, but feedback about our interface design was pretty universally positive, which I'm proud of. To his credit, Andrius was really good at getting busy people working jobs that probably don't excite them all that much to spend time talking to us about those jobs. 

After leaving Simple Construction Software in September of 2022, I was texting a founder friend of mine about the blues of having another failed startup under my belt. He offered me a job leading the tech team at his startup. That friend was [Andrew Jajack](https://www.linkedin.com/in/ajajack/), and the company was [[./Spot Health|Spot Health]]. The journey continued.


![[../Assets/simple-construction-software-salesforce-tower.png|simple-construction-software-salesforce-tower.png]]
![[../Assets/simple-construction-software-pitch.png|simple-construction-software-pitch.png]]