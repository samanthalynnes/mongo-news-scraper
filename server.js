// Dependencies
const express = require("express");
const logger = require("morgan");
const mongoose = require("mongoose");
const path = require("path");

// Scraping tools
const axios = require("axios");
const cheerio = require("cheerio");

// Requiring all models
const db = require("./models");

// Initializing the port
const PORT = process.env.PORT || 3000;

// Initializing Express
const app = express();

// Middleware
// Use morgan logger for logging requests
app.use(logger("dev"));
// Parse request body as JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Make public a static folder
app.use(express.static("public"));

// Using Handlebars
const exphbs = require("express-handlebars");
app.engine("handlebars", exphbs({
  defaultLayout: "main",
  partialsDir: path.join(__dirname, "/views/layouts/partials")
}));
app.set("view engine", "handlebars");

// Connecting to the Mongo DB
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/mongoHorseNews";
mongoose.connect(MONGODB_URI, { useNewUrlParser: true });

// ***************
// Routes
// ***************

// GET request to render handlebars page
app.get("/", function (req, res) {
  db.Article.find({ saved: false }, function (error, data) {
    var hbsObject = {
      article: data
    };
    console.log(hbsObject);
    res.render("home", hbsObject);
  })
})

app.get("/saved", function (req, res) {
  db.Article.find({ saved: true })
    .populate("notes")
    .exec(function (error, articles) {
      var hbsObject = {
        article: articles
      };
      res.render("saved", hbsObject);
    });
});

// GET route to scrape The Horse's news webpage for the article data
app.get("/scrape", function (req, res) {
  axios.get("http://www.thehorse.com/news").then(function (response) {
    const $ = cheerio.load(response.data);

    $("h2").each(function (i, element) {
      const result = {};

      result.title = $(element).text();

      result.link = $(element).children("a").attr("href");

      db.Article.create(result)
        .then(function (dbArticle) {
          console.log(dbArticle);
        })
        .catch(function (err) {
          console.log(err);
        });
    });
  });
  res.send("Scrape Complete");
});

// This will get the articles we scraped from the mongoDB
app.get("/articles", function (req, res) {
  db.Article.find({})
    .then(function (dbArticle) {
      res.json(dbArticle);
    })
    .catch(function (err) {
      res.json(err);
    });
});

// Grab an article by it's ObjectId
app.get('/articles/:id', function (req, res) {
  db.Article.findOne({ _id: req.params.id })
    .populate('note')
    .then(function (dbArticle) {
      res.json(dbArticle);
    })
    .catch(function (err) {
      res.json(err);
    });
});

// Save an article
app.post('/articles/save/:id', function (req, res) {
  db.Article.findOneAndUpdate({ _id: req.params.id }, { saved: true })
    .then(function (dbArticle) {
      res.json(dbArticle);
    })
    .catch(function (err) {
      res.json(err);
    });
});

// Delete an article
app.post('/articles/delete/:id', function (req, res) {
  db.Article.findOneAndUpdate({ _id: req.params.id }, { saved: false, notes: [] }, function (err) {
    if (err) {
      console.log(err);
      res.end(err);
    }
    else {
      db.Note.deleteMany({ article: req.params.id })
        .exec(function (err) {
          if (err) {
            console.log(err);
            res.end(err);
          } else
            res.send("Article Deleted");
        });
    }
  });
});

// Create a new note
app.post("/notes/save/:id", function (req, res) {
  var newNote = new db.Note({
    body: req.body.text,
    article: req.params.id
  });
  newNote.save(function (error, note) {
    return db.Article.findOneAndUpdate({ _id: req.params.id }, { $push: { notes: note } })
      .exec(function (err) {
        if (err) {
          console.log(err);
          res.send(err);
        } else {
          res.send(note);
        }
      });
  });
});

// Delete a note
app.delete('/notes/delete/:note_id/:article_id', function (req, res) {
  db.Note.findOneAndRemove({ _id: req.params.note_id }, function (err) {
    if (err) {
      console.log(err);
      res.send(err);
    } else {
      db.Article.findOneAndUpdate({ _id: req.params.article_id }, { $pull: { notes: req.params.note_id } })
        .exec(function (err) {
          if (err) {
            console.log(err);
            res.send(err);
          } else {
            res.end("Note Deleted");
          }
        });
    }
  });
});


// Starting the server
app.listen(PORT, function () {
  console.log("App running on port " + PORT + "!");
});