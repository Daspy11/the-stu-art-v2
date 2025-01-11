---
series: 
aliases:
  - Large language models
date: 2023-12-20
updated: 2025-01-11
status: Published
created: 2025-01-06
share: true
---

#essay 
# Escaping Skeuomorphism (AI predictions time capsule)

## I.

Consider this my time capsule. I'm going to make a bunch of broadly unsubstantiated predictions about the medium-term future of large language models based on an irrational strength of intuition that I feel in my heart.

Everyone likes to laugh at the supposedly prestigious goons who said very foolish things about the internet. That the internet and personal computing were nonces that would never find adoption.

As someone deeply embedded in the venture capital and startup scene during the crypto boom, I remember feeling like an alien. Prior to the fall of the Terra ecosystem, crypto seemed like an untouchable monolith that everyone important seemed to believe was world-changing technology.

All of the minds I respected the most were tremendously bought-in to this new technology that seemed to me so nakedly flawed. Even Y Combinator, an institution I respected deeply (and still do) backed StableGains, a company which offered a 15% annual return on investment by relying on StableCoin staking mechanisms. 

My internal thought process was something like *"Am I crazy? Doesn't this just not work? Doesn't it rely on an infinite money funnel that cannot continue?"* 

The same people who seemed very excited by this were the same people who'd backed a lot of great companies I got a lot of value out of when others thought it was crazy. I wondered if I was just out of touch.

All over the place, the biggest minds were dropping billions of dollars on ventures that just... didn't make sense to me. 

And then Terra Luna collapsed, [taking StableGains with it](https://www.businessinsider.com/terra-luna-cryptocurrency-crash-stablegains-2022-6?r=US&IR=T), and StableGains' customers lost >$40M. The Terra Luna collapse also took out Three Arrows, which indirectly ended up taking out FTX, and now we're here. NFTs increasingly look as if they'll be remembered like Dutch tulip mania. 

## II.

Some of this is inevitable. Novel technology has a hype cycle, and inflated expectations are a normal and expected part of that hype cycle. Inflated expectations inevitably come with a deflation down the road. Usually, that deflation looks like [Meta's quiet walk away from the Metaverse](https://www.businessinsider.com/meta-layoffs-ceo-mark-zuckerberg-moves-away-from-metaverse-ai-2023-3?r=US&IR=T) and not the spontaneous implosion and prosecution of everyone all at once.


That was then.



I see some people talking the same way about large language models as I have been about cryptocurrency. 



I see artists clutching copyright law. 



I see the old-timey Linux sysadmin types grumbling in a corner on Hacker News about how this so-called AI isn't anything new, and that the technology will never progress beyond barely-competent bullshit generators.



I see the AI doom faction saying lots of things about doom, and their adversaries saying lots of things about regulatory capture. I'm not sure I identify with either of them.



Some more nuanced commenters like this one from Hacker News offer a somewhat plausible argument for an impending cooling of expectations:

> I don't believe LLM's will ever become AGI, partly because I don't believe that training on the outputs of human intelligence (i.e. human-written text) will ever produce something equivalent to human intelligence.
> 
> You can't model and predict the weather just by training on the outputs of the weather system (whether it rained today, whether it was cloudy yesterday, and so on). You have to train on the inputs (air currents, warm fronts, etc.)
>
> You can't model and predict the stock market just by training on the outputs of stock trading decisions (the high today, the low yesterday). You have to train on the inputs (company fundamentals, earnings, market sentiments in the news, etc.)
> 
> I similarly think you have to train on the inputs of human decision-making to create something which can model human decision-making. What are those inputs? We don't fully know, but it is probably some subset of the spatial and auditory information we take in from birth until the point we become mature, with "feeling" and "emotion" as a reward function (seek joy, avoid pain, seek warmth, avoid hunger, seek victory, avoid embarrassment and defeat, etc.)
> 
> Language models are always playing catch-up because they don't actually understand how the world works. The cracks through which we will typically notice that they don't, in the context of the tasks typically asked of them (summarize this article, write a short story), will gradually get smaller over time (due to RLHF), but the fundamental weakness will always remain.
> 
> - [wavemode](https://news.ycombinator.com/user?id=wavemode)


I'm going to take a big bet against everyone who's even a little bit cynical. I think change is coming, and it's going to be big. *Maybe* bigger in terms of effect on people than the internet. Certainly that kind of scale. Big in the way of civilisation being almost unrecognisable soon. 

## III.

When Apple invented the mouse, consumers didn't automatically know how to use it. Apple's hunch was that the quality ceiling of mouse-based interactions would be much higher than terminal or keyboard-based navigation because of the intuitiveness. They were right. They won again with the touchscreen; both interfaces are now ubiquitous. 

But this was the first Apple mouse.

![[escaping-skeuomorphism-mouse.png]]

In both cases, although a new kind of input had been created, it took much longer for optimal ergonomics to develop. 40 years on, I think it's unlikely a mouse will ever release that is a substantial advance on ergonomics invented in the early 2010s - the Logitech G502 comes to mind. I think if you held an early mouse from any manufacturer, you'd feel that this is not the final form immediately.

Importantly, the barrier to making better mice wasn't the technology - mice are conceptually pretty simple, the interfaces needed already existed, and there's nothing special about the hardware. What took time was the development of software patterns that could take advantage of this new method of input. It took 12 years from the release of the first mouse for the standard two-buttons-and-a-wheel design to catch on.

> Back in 1993, as I was watching many Excel users do their work, I noticed the difficulty they had moving around large spreadsheets. Finding and jumping to different sections was often difficult. I had the idea that perhaps a richer input device would help.
> 
> My original idea was the zoom lever. This was simply a lever, presumably for your non-mouse hand (i.e. on the left side of your keyboard if you're right-handed). When you push it away from you the spreadsheet zooms out. When you pull it towards you, it zooms back in.
> 
> I prototyped this by hooking a joystick up to my computer and using DDE to connect it to Excel for zooming. Using a joystick button along with the stick, I also had it do "data zooming", which was drilling in and out through Excel outlines.
> 
> This all seemed useful, so I showed it to the Hardware division at Microsoft. They were initially cool to the idea, which I presented as a zoom lever, and it didn't go anywhere at that point.
> 
> At this point most people thought it was kind of wacky. Focusing on zooming was a very Excel-centric approach. More specifically, it was a very 2-D centric approach. That is, using an application that presents 2-dimensional data, like a spreadsheet or graphics, it's very useful to zoom in and out. But the other main style of application is a linear flow application like Word, and there it's not as useful. You could do zooming with Word, where zooming out shows you a multi-page view and then you click on a desired page and zoom into it, but that's not as natural as with a spreadsheet or graphics and images.
> 
> A number of people suggested adding panning and scrolling functionality. In particular I remember Chris Graham saying zooming was just too limiting and it should pan as well. In response to this feedback, I added panning to the prototype, so moving the joystick side-to-side and back-and-forth scrolled Excel in the corresponding direction.
> 
> Around this time, the hardware guys came back and said that they had considered adding a wheel to the mouse, but they didn't know what it would be used for. Document navigation answered that question, so they said that if I could get Office to support it, they would build it. This really meant Excel and Word since they were the "800 lb gorillas" -- if Excel and Word supported something, then the other Office apps would follow, and if Office as a whole supported something, then everyone else would follow too (this was the early 1993 when Office was the heart of most people's computer usage).
> 
> - [**Eric Michelman**, The History of the Scroll Wheel](http://www.ericmic.com/history%20of%20the%20scroll%20wheel.htm?ref=blog.codinghorror.com)

The key takeaway here is that the HardwareBoffins had already conceptualised the *mechanics* of how to add a wheel to the mouse, but it took watching users in the wild to affirm it as a good choice. 

## IV.

Video game graphics are an example of the opposite kind of barrier to development - limitations on the power of home computers set hard controls on the ergonomics of game aesthetics. Selective rendering, zoning, and other optimisations get beautiful games to run, but if we could suddenly 10x the power of home computers, we'd likely see an overnight spike in the beauty of new video games. Meaningful advances in home computational power come from hard research and hard logistical scaling to manufacture new kinds of chips at scale.

If you're a video game designer developing a game with cutting edge graphics, you need to take bets on the fidelity you'll be able to achieve on consumer grade hardware several years into the future if you want to truly take advantage of the technology on offer. There's some uncertainty here, but it's still a pretty reasonable bet to make that everyone's computer will be a Little Bit More Powerful a few years than they are now. Some decisions you make can be easily scaled, others can't. Graphical effects can be enabled or disabled programmatically, but CPU load in the form of interactions and game logic can't easily be. 

Eventually, large language models will be ubiquitous, like the mouse or touchscreen. Part of my wager is that they're going to go further than ubiquitous and become the fabric on which society is built - like the internet. The internet is much more important than just a mere ubiquitous tool interacted with by billions - it's not really even possible to build a society that works without it. 

While there are gains to be made in terms of capabilities which can only come from hard science and the hard logistics of scaling GPU racks and datacenters, I think there's a wealth of short term gains in ergonomics that aren't being focused on enough.

I think ChatGPT is like the skeuomorphism of the early 2000s. In the days where digitisation was new, a common philosophy amongst designers was to rely on making digital technology look similar to tools we use in the real world. The earliest way to realise "clickability" (how intuitive it is that an element is an interaction target) was simply to model the the visual appearance of the object based on a real-world object with the same utility. The notepad looked like a notepad, so that means it functions like a notepad.

It's easy to write off current design norms for everyday activities as being either obviously the best approach and already at a global maxima, or simply a subjective meta in a sprawling sea of forms - a fashion. I think both of these things are normally wrong. 

One type of technical accomplishment I hold in the absolute highest esteem is ergonomic advancements to things that seemed obviously solved.

The best example I have of this in recent times is word processing in the last decade. It has been a *phenomenal* decade for tools to write text on a page and share it. Notion cracked open one of the last remaining skeletons of skeuomorphism - the idea that a document is essentially a big piece of paper. Even Google took heed and have been leaning into "smart chips" and "pageless mode" for Google docs recently. 

But never forget that it wasn't possible to create a document without a fixed page size in Google Docs until 2022. 

Big idea. Always possible. Lots of ergonomics advantages. Took 30 years from the mainstream adoption of digital word processing to be realised. Evolving beyond our natural skeuomorphic tendencies takes time.

## V.

A lot of people more mathematically inclined than me are going to do a lot of clever work on advancing AI models, but I think there's underappreciated work to be done advancing new LLM interaction modalities that go beyond the skeuomorphic approach of replicating a conversational experience. 

In addition to betting against LLM skeptics, I'm also betting against any system whose main interaction modality is similar to human interaction. I've seen a variety of people trying to bundle up LLMs as employee replacements, or build chat interfaces for "talking to code" or as "teachers". Don't even get me started on the long maligned (and rightly so) customer service chatbots from hell.

These are crude, primitive tools which will not be looked back on fondly. Don't get me wrong, language models *will* replace educators and call centres, but they won't do so as imitations. Even near-perfect replication isn't enough to outdo the uncanny valley. 

The conversation modality will continue to have relevance as roleplaying tools for leisure and may have niche pedagogic utility as a way to introduce fun into education, but it's not how the future is going to look.

Smartphones became a physical extension of our bodies that we're anxious and often unable to function without. They give us incredible superpowers. Perfect knowledge of direction and the logistics required to get to any place. Instant communication with anyone, anywhere in the world. Any kind of information, immediately.

There have been some hamfisted attempts to replicate this experience with glasses, headsets, or most recently [badges](https://www.theverge.com/2023/11/9/23953901/humane-ai-pin-launch-date-price-openai), but they don't *quite work* for reasons that are nuanced and hard to anticipate theoretically. It was famously cited that it felt rude to be talking to a Google glass user as they looked up at their notifications. This glaring social deficit was deadly out of the gate but hard to anticipate, even if you're a motivated and capable interaction designer. I'll reserve judgement on Apple's latest attempts at goggles for now. 

The closest thing to language models becoming an extension of the body so far I think has been felt by software engineers interacting with LLM-powered autocomplete for code. There are many times where, like magic, AI just wrote a whole block of code I was about to bash out piece by piece. That didn't feel like I was using a tool, it felt like my own capabilities were being extended. There's no doubt in my mind that autocomplete will win. 

I think this capability only came about because autocomplete was already a norm from typing on smartphones. A human assistant would never dream of finishing your sentences. Such a thing isn't just unhelpful, it's unsettling and is considered rude by most.

I have no doubt that there's a bounty of interaction styles left undiscovered. Most of the obvious skeuomorphic approaches are already being tried, but there's no shortage of novel additions to bring. I expect that much like word processing, many of the coolest and most groundbreaking approaches won't be tried successfully for another decade or three. Maybe the language models can help design their own interfaces, but I doubt it given the deeply human nature of optimising technology ergonomics.

## VI.

It's easy to dance around and either make big sweeping gestures at everything so vaguely that no meaning can be derived, or poke tiny holes in something so small that nothing can be generalised. This is my attempt at a time capsule. If I didn't make any specific, pointed guesses about the future, it wouldn't lock me in to an early 2020s conception of futurism tightly enough to be interesting to revisit in the future.

So in the spirit of boldness, here's where I venture into unknown territory and offer some of my own ideas. This is what I think comes next for interaction modes.

1. I think voice commands are coming back big time, but not as conversational agents. Voice controls were always a sensible approach since talking is faster than typing, and voice comprehension tech has come a long way, especially as it relates to proper nouns. Alexa and Google home were on the right track but couldn't provide utility beyond just playing music and so were hard to monetise. There are still big limitations here regarding how LLMs interact with systems built for humans, but I expect to see a new field of interaction design emerge. Currently we have HTML, CSS and Javascript for humans, and JSON, XML and GraphQL for systems. I think there's a third class of tool that helps AI agents comprehend and interact with new systems on the way.
   
2. The main shortcoming of shorthand has always been that it is hard to read and lacks the emotional colour of prose. Large language models are exceptionally good at synthesising content and mood into prose, and I wonder how that extends to our ability to signal mood via the written word. Emojis are the de-facto way now to fill in the gap left by the impersonal nature of written communication, but I don't think emoji keyboards are the final form of efficient emotional expression.
   
3. The current golden age of word processing technology is not over yet. Notion brought block-based content styling and the elimination of pages to the scene. Autocomplete is the first step, but isn't mature yet. I'm absolutely sure there's more to come here. 

4. There's a crucial tipping point of trust that I'm sure will occur at some point in the next 20 years where people let AI agents make meaningful decisions on their behalf. Some people think of the agent in this case essentially as a robotic executive assistant or therapist or consultant, but that's a skeuomorphic way of thinking about things modelled around the idea of a persona which I think is unnecessary. I think a much more realistic alternative is essentially fine-tuning a language model on somebody's preferences to such a degree that it's like a second brain for them and not an assistant. I have conversations with myself in my brain all the time, but these are fundamentally different kinds of conversations than I would have with another person. When I try to figure out what I want to do in a certain situation, I'm not *advising* myself, or asking myself for help, I'm trying to work out *what I already think*. I'm nowhere close to conceptualising what this would look like in reality, but I think I'll know it when I see it.

In the short term though, language models are not going anywhere, and large swathes of the population are about to get a very serious reminder that it's not possible to close the Pandora's Box of a new technology once it's opened. 

Let me be even more specific on what I think is going to happen next.

---

Artists will lose the intellectual property war.

In fiction, the prose-formation capabilities of large language models will overtake that of human creatives across the board very shortly. Initially, this will look like a massive wave of democratised access to high quality writing facilities as the work requirement to produce high quality books decreases on a race to the bottom. Eventually, that democratisation will be captured at scale by a few large companies that provide personalised fiction, likely with interactive elements, at scale.

In the same vein, the days of static fiction are numbered. The video game genre will grow to consume both TV shows and fiction books, both of which will become relics, like silent movies.

On the flipside, video games of the 2030s and 2040s are going to be unimaginably cool. Not only will large, open-world, triple A titles continue to grow in scale, I think the best gains to be had are in the micro - every guard and fisherman and mercenary has their own story. 

---

I think an underappreciated but *tremendous* upside I haven't heard many people talking about is likely universal, instant access to high quality general practice healthcare. The caring profession is still in trouble, don't get me wrong, but I think there will be an increasing divide between the logistics of everyday healthcare, and specialist and emergency care. There's a band of medical professions somewhere in the middle - physiotherapy, regular therapy, general practice - that will decrease significantly in prominence.

The strongest naysaying argument I've seen against this is the idea that human interaction in first point of contact healthcare is fundamental and essential and we couldn't possibly ever do without it, but I think a lot of people said similar things about text messaging and social media and yet here we are. 

And I'm glad to be hoping that they're wrong, because I think the upside here is probably measured in billions of additional years of [healthspan](https://dictionary.cambridge.org/dictionary/english/healthspan).

---

The way we socialise is likely to become significantly worse before it gets better (if it ever does). This is one of the only things I have a negative outlook on. I'm not convinced that additional access to tools to actualise yourself better will outweigh the very odd things that will happen once perfectly believable AI personas at scale are possible. 

It's probable that someone will invent some kind of meat-based verification system to make sure everyone is real. Once the problem gets severe enough, regulatory attitudes, the product management incentives and online trust norms probably all meet in the middle and probably put an genuinely quite impressive dent in the current trend of fake accounts pushing fake content.

## VII.

In the end, I find myself optimistic about large language models and skeptical of the idea of the singularity occurring in all modes at once and rapidly accelerating. 

Bring it on, world.