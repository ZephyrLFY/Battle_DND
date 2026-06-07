#ifndef BATTLEGROUND_H
#define BATTLEGROUND_H

#include <QDialog>
#include <QGraphicsScene>
#include <QGraphicsItem>
#include <QPixmap>
#include <QThread>
#include <QMessageBox>
#include "petcreating.h"

namespace Ui {
class Battleground;
}

class BattleThread : public QThread
{
    Q_OBJECT
public:
    BattleThread(pokemon *a,pokemon *b);
    void beat(pokemon &a,pokemon&b,qint32 ran);
    QString result(pokemon &a,pokemon &b);
    void battle(pokemon &a,pokemon &b);
    void run();
signals:
    void done();
    void MyLabel(QString);
    void EnmLabel(QString);
    void MyOutput(QString);
    void EnmOutput(QString);
    void result(QString);
    void winOrLose(int);
    void addNewPoke(int);
    void choseOne();
private:
    int generateRandomInteger(int min,int max);

    pokemon *a,*b;
};

class Battleground : public QDialog
{
    Q_OBJECT

public:
    explicit Battleground(QWidget *parent = nullptr);
    ~Battleground();
    void connects();
signals:
    void addNewPoke(int);
    void dltPoke();
private slots:
    void on_battleBtn_clicked();
    void update();
    void over();
    void result(QString content);
private:
    void initScene();
    void initMap();
    void initPoke(QString nameL,QString nameR);
    Ui::Battleground *ui;
    QGraphicsScene *scene;
    QPixmap *pix;
    pokemon *my;
    pokemon *enm;
    BattleThread *thread;
};

#endif // BATTLEGROUND_H
