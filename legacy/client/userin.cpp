#include "userin.h"
#include "ui_userin.h"
#include "wideuse.h"
#include "localusr.h"

UserIn::UserIn(QWidget *parent) :
    QDialog(parent),
    ui(new Ui::UserIn)
{
    ui->setupUi(this);
}

UserIn::~UserIn()
{
    delete ui;
}

void UserIn::on_loginBtn_clicked()
{
    QString name = ui->usrLineEdit->text();
    QString pwd = ui->pwdLineEdit->text();
    if(name.isEmpty() || pwd.isEmpty())
    {
        QMessageBox::warning(this, tr("警告！"),tr("用户名或密码不能为空！"),QMessageBox::Yes);
        ui->usrLineEdit->clear();
        ui->pwdLineEdit->clear();
        ui->usrLineEdit->setFocus();
    }
    else
    {
        QList<QString> log;
        log << "1" << name << pwd;
        emit login(log);
    }
}

void UserIn::isOrNot(int which)
{
    if(which == 2)
        success();
    else
        failed(which);
}

void UserIn::success()
{
    QString usrName = ui->usrLineEdit->text().toUtf8();
    localUser = new localUsr(usrName);
    accept();
}

void UserIn::failed(int which)
{
    if(which == 3 || which == 1)
    {
        if(which == 1)
            QMessageBox::warning(this, tr("警告！"),tr("不存在该用户"),QMessageBox::Yes);
        else
            QMessageBox::warning(this, tr("警告！"),tr("该用户已上线"),QMessageBox::Yes);
        ui->usrLineEdit->clear();
        ui->pwdLineEdit->clear();
        ui->usrLineEdit->setFocus();
    }
    else
    {
        QMessageBox::warning(this, tr("警告！"),tr("密码错误！"),QMessageBox::Yes);
        ui->pwdLineEdit->clear();
        ui->pwdLineEdit->setFocus();
    }
}
