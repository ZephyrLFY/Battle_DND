#ifndef WELCOME_H
#define WELCOME_H

#include <QDialog>
#include <QPixmap>
#include <QGraphicsScene>
#include <QGraphicsItem>
#include "newuser.h"
#include "userin.h"

namespace Ui {
class welcome;
}

class welcome : public QDialog
{
    Q_OBJECT

public:
    explicit welcome(QWidget *parent = nullptr);
    ~welcome();

    void initScene();
signals:
    void login(QList<QString>&);
    void inresult(int);
    void logon(QList<QString>&);
    void onresult(int);
private slots:
    void logIn(QList<QString> &content);
    void inResult(int flag);
    void logOn(QList<QString> &content);
    void onResult(int flag);
    void on_loginBtn_clicked();
    void on_logupBtn_clicked();
private:
    Ui::welcome *ui;
    QGraphicsScene *scene;
    QPixmap *pix;
    UserIn *dlg1;
    Newuser *dlg2;
};

#endif // WELCOME_H
