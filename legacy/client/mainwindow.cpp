#include "mainwindow.h"
#include "ui_mainwindow.h"
#include "wideuse.h"
#include "logout.h"
#include "userview.h"
#include "pokeview.h"
#include "mymap.h"
#include "prebtl.h"
#include "battleground.h"

MainWindow::MainWindow(QWidget *parent) :
    QMainWindow(parent),
    ui(new Ui::MainWindow)
{
    ui->setupUi(this);
    setConnectWithThread();
    initLocalUser();
    initMap();
    setTimer();
}

MainWindow::~MainWindow()
{
    delete zhi;
    scene->clear();
    delete scene;
    delete timer;
    delete ui;
}

void MainWindow::setConnectWithThread()
{
    connect(this,SIGNAL(initUser(QList<QString>&)),udpthread,SLOT(initUser(QList<QString>&)));
    connect(udpthread,SIGNAL(userGet(QList<QString>&)),this,SLOT(getUser(QList<QString>&)));
    connect(this,SIGNAL(logOut(QList<QString>&)),udpthread,SLOT(logOut(QList<QString>&)));
    connect(udpthread,SIGNAL(outResult(QList<QString>&)),this,SLOT(outResult(QList<QString>&)));
}

void MainWindow::updateDT()
{
    ui->dateEdit->setDate(QDate::currentDate());
    ui->timeEdit->setTime(QTime::currentTime());
}

void MainWindow::setTimer()
{
    timer = new QTimer(this);
    connect(timer,SIGNAL(timeout()),this,SLOT(updateDT()));
    timer->start(1000);
    ui->dateEdit->setEnabled(0);
    ui->timeEdit->setEnabled(0);
    updateDT();
}

void MainWindow::initLocalUser()
{
    QList<QString> text;
    text << "7" << localUser->getName();
    emit initUser(text);
}

void MainWindow::initScene()
{
    scene->setSceneRect(100 , 20 , 400, 250);
}

void MainWindow::initMap()
{
    disconnect(this,SIGNAL(initUser(QList<QString>&)),udpthread,SLOT(initUser(QList<QString>&)));
    disconnect(udpthread,SIGNAL(userGet(QList<QString>&)),this,SLOT(getUser(QList<QString>&)));
    scene = new QGraphicsScene(this);
    initScene();
    ui->wow->setScene(scene);
    zhi = new Man;
    Arena *arena = new Arena(290,40);
    Gym *gym = new Gym(470,120);
    Music *music = new Music(360,240);
    Exit *exit = new Exit(130,230);
    scene->addItem(zhi);
    scene->addItem(arena);
    scene->addItem(gym);
    scene->addItem(music);
    scene->addItem(exit);
    scene->setFocus();
}

void MainWindow::keyPressEvent(QKeyEvent *e)
{
    switch (e->key())
    {
    case Qt::Key_W:keyUp();break;
    case Qt::Key_A:keyLeft();break;
    case Qt::Key_D:keyRight();break;
    case Qt::Key_S:keyDown();break;
    default:break;
    }
}

void MainWindow::keyUp()
{
    zhi->moveBy(0,-10);
    if(zhi->pos().ry() < 250 &&zhi->pos().ry() > 190 && zhi->pos().rx() <= 150 && zhi->pos().rx() >= 90)
    {
        on_logoutBtn_clicked();
        zhi->setPos(290,120);
    }
    if(zhi->pos().ry() < 60 &&zhi->pos().ry() > 0 && zhi->pos().rx() <= 310 && zhi->pos().rx() >= 250)
    {
        on_btlBtn_clicked();
        zhi->setPos(290,120);
    }
    if(zhi->pos().ry() < 140 &&zhi->pos().ry() > 80 && zhi->pos().rx() <= 490 && zhi->pos().rx() >= 430)
    {
        on_lvlBtn_clicked();
        zhi->setPos(290,120);
    }
    if(zhi->pos().ry() < 260 &&zhi->pos().ry() > 200 && zhi->pos().rx() <= 380 && zhi->pos().rx() >= 320)
    {
        on_musicBtn_clicked();
        zhi->setPos(290,120);
    }
    if(zhi->pos().ry() < -10)
        zhi->setY(270);
}

void MainWindow::keyDown()
{
    zhi->moveBy(0,10);
    if(zhi->pos().ry() < 250 && zhi->pos().ry() > 190 && zhi->pos().rx() <= 150 && zhi->pos().rx() >= 90)
    {
        on_logoutBtn_clicked();
        zhi->setPos(290,120);
    }
    if(zhi->pos().ry() < 60 &&zhi->pos().ry() > 0 && zhi->pos().rx() <= 310 && zhi->pos().rx() >= 250)
    {
        on_btlBtn_clicked();
        zhi->setPos(290,120);
    }
    if(zhi->pos().ry() < 140 &&zhi->pos().ry() > 80 && zhi->pos().rx() <= 490 && zhi->pos().rx() >= 430)
    {
        on_lvlBtn_clicked();
        zhi->setPos(290,120);
    }
    if(zhi->pos().ry() < 260 &&zhi->pos().ry() > 200 && zhi->pos().rx() <= 380 && zhi->pos().rx() >= 320)
    {
        on_musicBtn_clicked();
        zhi->setPos(290,120);
    }
    if(zhi->pos().ry() > 270)
        zhi->setY(-10);
}

void MainWindow::keyRight()
{
    zhi->moveBy(10,0);
    if(zhi->pos().rx() > 90 && zhi->pos().rx() < 150 && zhi->pos().ry() >= 190 && zhi->pos().ry() <= 250)
    {
        on_logoutBtn_clicked();
        zhi->setPos(290,120);
    }
    if(zhi->pos().ry() < 60 &&zhi->pos().ry() > 0 && zhi->pos().rx() <= 310 && zhi->pos().rx() >= 250)
    {
        on_btlBtn_clicked();
        zhi->setPos(290,120);
    }
    if(zhi->pos().ry() < 140 &&zhi->pos().ry() > 80 && zhi->pos().rx() <= 490 && zhi->pos().rx() >= 430)
    {
        on_lvlBtn_clicked();
        zhi->setPos(290,120);
    }
    if(zhi->pos().ry() < 260 &&zhi->pos().ry() > 200 && zhi->pos().rx() <= 380 && zhi->pos().rx() >= 320)
    {
        on_musicBtn_clicked();
        zhi->setPos(290,120);
    }
    if(zhi->pos().rx() > 490)
        zhi->setX(80);
}

void MainWindow::keyLeft()
{
    zhi->moveBy(-10,0);
    if(zhi->pos().rx() > 90 && zhi->pos().rx() < 150 && zhi->pos().ry() >= 190 && zhi->pos().ry() <= 250)
    {
        on_logoutBtn_clicked();
        zhi->setPos(290,120);
    }
    if(zhi->pos().ry() < 60 &&zhi->pos().ry() > 10 && zhi->pos().rx() <= 310 && zhi->pos().rx() >= 250)
    {
        on_btlBtn_clicked();
        zhi->setPos(290,120);
    }
    if(zhi->pos().ry() < 140 &&zhi->pos().ry() > 80 && zhi->pos().rx() <= 490 && zhi->pos().rx() >= 430)
    {
        on_lvlBtn_clicked();
        zhi->setPos(290,120);
    }
    if(zhi->pos().ry() < 260 &&zhi->pos().ry() > 200 && zhi->pos().rx() <= 380 && zhi->pos().rx() >= 320)
    {
        on_musicBtn_clicked();
        zhi->setPos(290,120);
    }
    if(zhi->pos().rx() < 80)
        zhi->setX(490);
}

void MainWindow::on_lvlBtn_clicked()
{
    localUser->whichBattle(1);
    if(isMusic)
        player->pause();
    preBtl lvlup;
    if(lvlup.exec() == QDialog::Accepted)
    {
        Battleground btl;
        btl.exec();
    }
    else
    {
        if(isMusic)
            player->play();
    }
}

void MainWindow::on_action_triggered()
{
    userView viewer;
    viewer.exec();
}

void MainWindow::on_action_2_triggered()
{
    pokeView viewer;
    viewer.exec();
}

void MainWindow::on_musicBtn_clicked()
{
    if(!isMusic)
    {
        player = new QMediaPlayer(this);
        playlist = new QMediaPlaylist(this);
        playlist->setPlaybackMode(QMediaPlaylist::Loop);
        playlist->addMedia(QUrl::fromLocalFile("/Users/zephyr/Desktop/TOEFL/bgm1.mp3"));
        playlist->addMedia(QUrl::fromLocalFile("/Users/zephyr/Desktop/TOEFL/bgm2.mp3"));
        player->setPlaylist(playlist);
        player->play();
        isMusic = 1;
        isPlaying = 1;
    }
    else
    {
        if(isPlaying)
        {
//            player->pause();
//            isPlaying = 0;
            int currentIndex = playlist->currentIndex();
            if(++currentIndex==playlist->mediaCount())
                currentIndex=0;
            playlist->setCurrentIndex(currentIndex);
            player->play();
        }
        else
        {
            player->play();
            isPlaying = 1;
        }
    }
}

void MainWindow::loseLink()
{
    QList<QString> text;
    text << "4" << localUser->getName();
    emit logOut(text);
}

void MainWindow::on_logoutBtn_clicked()
{
    logout sure;
    if(sure.exec() == QDialog::Accepted)
        loseLink();
}

void MainWindow::outResult(QList<QString>& content)
{
    if(content.at(0).toInt() == 0)
        QMessageBox::warning(this,"注销失败","请重试。",QMessageBox::Yes);
    else
        this->close();
}

void MainWindow::getUser(QList<QString>& content)
{
    content.removeFirst();
    localUser->initUsr(content);
}

void MainWindow::on_btlBtn_clicked()
{
    localUser->whichBattle(0);
    preBtl lvlup;
    if(lvlup.exec() == QDialog::Accepted)
    {
        Battleground btl;
        btl.exec();
    }
}

