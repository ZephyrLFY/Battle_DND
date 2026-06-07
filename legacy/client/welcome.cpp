#include "welcome.h"
#include "ui_welcome.h"
#include "newuser.h"
#include "userin.h"
#include "wideuse.h"

welcome::welcome(QWidget *parent) :
    QDialog(parent),
    ui(new Ui::welcome)
{
    ui->setupUi(this);
    initScene();
    connect(this,SIGNAL(login(QList<QString>&)),udpthread,SLOT(sendIn(QList<QString>&)));
    connect(this,SIGNAL(logon(QList<QString>&)),udpthread,SLOT(sendOn(QList<QString>&)));
    connect(udpthread,SIGNAL(inResult(int)),this,SLOT(inResult(int)));
    connect(udpthread,SIGNAL(onResult(int)),this,SLOT(onResult(int)));
}

welcome::~welcome()
{
    delete scene;
    delete pix;
    delete ui;
}

void welcome::initScene()
{
    ui->textBrowser->viewport()->setAutoFillBackground(false);
    ui->textBrowser->setFrameStyle(QFrame::NoFrame);
    scene = new QGraphicsScene(this);
    scene->setSceneRect(0 , 0 , 600, 450);
    ui->background->setScene(scene);
    ui->background->setSceneRect(0, 0, ui->background->contentsRect().width(), ui->background->contentsRect().height());
    pix = new QPixmap(QPixmap::fromImage(QImage(":/new/ground/backGround/Back_welcome.jpeg")));
    *pix = pix->scaled(600,450);
    QGraphicsPixmapItem* item = new QGraphicsPixmapItem(*pix);
    scene->addItem(item);
}

void welcome::on_loginBtn_clicked()
{
    dlg1 = new UserIn(this);
    connect(dlg1,SIGNAL(login(QList<QString>&)),this,SLOT(logIn(QList<QString>&)));
    connect(this,SIGNAL(inresult(int)),dlg1,SLOT(isOrNot(int)));
    if(dlg1->exec() == QDialog::Accepted)
    {
        accept();
    }
}

void welcome::on_logupBtn_clicked()
{
    dlg2 = new Newuser(this);
    connect(dlg2,SIGNAL(logon(QList<QString>&)),this,SLOT(logOn(QList<QString>&)));
    connect(this,SIGNAL(onresult(int)),dlg2,SLOT(isOrNot(int)));
    if(dlg2->exec() == QDialog::Accepted)
    {
        accept();
    }
}

void welcome::logIn(QList<QString> &content)
{
    emit login(content);
}

void welcome::logOn(QList<QString> &content)
{
    emit logon(content);
}

void welcome::inResult(int flag)
{
    emit inresult(flag);
}

void welcome::onResult(int flag)
{
    emit onresult(flag);
}
